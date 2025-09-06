const cron = require('node-cron');
const { Op } = require('sequelize');
const BlastSession = require('../models/blastSessionModel');
const BlastMessage = require('../models/blastMessageModel');
const RetryConfiguration = require('../models/retryConfigurationModel');
const blastExecutionService = require('./blastExecutionService');
const logger = require('../utils/logger');

/**
 * Auto Retry Service for Failed Messages
 * Handles automatic retry logic based on configuration
 */
class AutoRetryService {
  constructor() {
    this.retryJobs = new Map(); // Store active retry jobs
    this.isInitialized = false;
    this.maxConcurrentRetries = 5;
    this.currentRetryCount = 0;
  }

  /**
   * Initialize the auto retry service
   */
  async initialize() {
    try {
      if (this.isInitialized) {
        logger.warn('🔄 Auto Retry Service already initialized');
        return;
      }

      // Schedule retry job to run every minute
      cron.schedule('* * * * *', async () => {
        await this.processRetryQueue();
      });

      // Schedule cleanup job to run every hour
      cron.schedule('0 * * * *', async () => {
        await this.cleanupOldRetries();
      });

      this.isInitialized = true;
      logger.info('🚀 Auto Retry Service initialized successfully');
      
      // Process existing retry queue on startup
      await this.processRetryQueue();

    } catch (error) {
      logger.error('❌ Failed to initialize Auto Retry Service:', error);
      throw error;
    }
  }

  /**
   * Enable auto retry for a blast session
   * @param {string} sessionId - Blast session ID
   * @param {object} config - Retry configuration
   * @param {number} userId - User ID
   */
  async enableAutoRetry(sessionId, config, userId) {
    try {
      // Validate session ownership
      const session = await BlastSession.findOne({
        where: { sessionId, userId }
      });

      if (!session) {
        throw new Error('Session not found or access denied');
      }

      // Create or update retry configuration
      const retryConfig = await RetryConfiguration.upsert({
        sessionId,
        userId,
        ...config,
        isEnabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      logger.info(`✅ Auto retry enabled for session ${sessionId}`);
      return retryConfig;

    } catch (error) {
      logger.error(`❌ Failed to enable auto retry for session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Disable auto retry for a blast session
   * @param {string} sessionId - Blast session ID
   * @param {number} userId - User ID
   */
  async disableAutoRetry(sessionId, userId) {
    try {
      const result = await RetryConfiguration.update(
        { isEnabled: false, updatedAt: new Date() },
        { where: { sessionId, userId } }
      );

      // Cancel any pending retry jobs for this session
      if (this.retryJobs.has(sessionId)) {
        clearTimeout(this.retryJobs.get(sessionId));
        this.retryJobs.delete(sessionId);
      }

      logger.info(`🛑 Auto retry disabled for session ${sessionId}`);
      return result;

    } catch (error) {
      logger.error(`❌ Failed to disable auto retry for session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Process retry queue - main retry logic
   */
  async processRetryQueue() {
    try {
      if (this.currentRetryCount >= this.maxConcurrentRetries) {
        return; // Skip if too many concurrent retries
      }

      // Get active retry configurations
      const retryConfigs = await RetryConfiguration.findAll({
        where: { 
          isEnabled: true,
          [Op.or]: [
            { pausedUntil: null },
            { pausedUntil: { [Op.lt]: new Date() } }
          ]
        },
        include: [{
          model: BlastSession,
          where: { status: { [Op.in]: ['running', 'paused', 'completed'] } }
        }]
      });

      for (const config of retryConfigs) {
        await this.processSessionRetries(config);
      }

    } catch (error) {
      logger.error('❌ Error processing retry queue:', error);
    }
  }

  /**
   * Process retries for a specific session
   * @param {object} config - Retry configuration
   */
  async processSessionRetries(config) {
    try {
      const sessionId = config.sessionId;

      // Check if we're within business hours (if configured)
      if (!this.isWithinBusinessHours(config)) {
        return;
      }

      // Check rate limits
      if (!await this.checkRateLimit(config)) {
        return;
      }

      // Get failed messages that are eligible for retry
      const failedMessages = await this.getEligibleFailedMessages(config);
      
      if (failedMessages.length === 0) {
        return;
      }

      logger.info(`🔄 Processing ${failedMessages.length} retry messages for session ${sessionId}`);

      // Process retries in batches
      const batchSize = config.batchSize || 5;
      for (let i = 0; i < failedMessages.length; i += batchSize) {
        const batch = failedMessages.slice(i, i + batchSize);
        await this.processBatch(batch, config);
        
        // Wait between batches
        if (i + batchSize < failedMessages.length) {
          await this.sleep(config.delayBetweenRetries || 30000);
        }
      }

    } catch (error) {
      logger.error(`❌ Error processing session retries for ${config.sessionId}:`, error);
    }
  }

  /**
   * Get failed messages eligible for retry
   * @param {object} config - Retry configuration
   * @returns {array} Array of messages to retry
   */
  async getEligibleFailedMessages(config) {
    const now = new Date();
    const maxRetries = config.maxRetries || 3;
    const retryDelay = config.retryDelay || 300000; // 5 minutes

    const whereConditions = {
      sessionId: config.sessionId,
      status: 'failed',
      [Op.or]: [
        { retryCount: null },
        { retryCount: { [Op.lt]: maxRetries } }
      ],
      [Op.or]: [
        { lastRetryAt: null },
        { lastRetryAt: { [Op.lt]: new Date(now - retryDelay) } }
      ]
    };

    // Skip certain error types if configured
    if (config.skipErrorTypes && config.skipErrorTypes.length > 0) {
      whereConditions.errorMessage = {
        [Op.not]: {
          [Op.iLike]: {
            [Op.any]: config.skipErrorTypes.map(type => `%${type}%`)
          }
        }
      };
    }

    // Filter by phone number patterns if configured
    if (config.onlyRetryNumbers && config.onlyRetryNumbers.length > 0) {
      whereConditions.phone = {
        [Op.iLike]: {
          [Op.any]: config.onlyRetryNumbers.map(pattern => `%${pattern}%`)
        }
      };
    }

    const messages = await BlastMessage.findAll({
      where: whereConditions,
      order: [['lastRetryAt', 'ASC'], ['createdAt', 'ASC']],
      limit: config.batchSize || 10
    });

    return messages;
  }

  /**
   * Process a batch of retry messages
   * @param {array} messages - Messages to retry
   * @param {object} config - Retry configuration
   */
  async processBatch(messages, config) {
    this.currentRetryCount++;

    try {
      for (const message of messages) {
        await this.retryMessage(message, config);
        
        // Small delay between individual retries
        await this.sleep(config.delayBetweenMessages || 2000);
      }

    } finally {
      this.currentRetryCount--;
    }
  }

  /**
   * Retry a single message
   * @param {object} message - Message to retry
   * @param {object} config - Retry configuration
   */
  async retryMessage(message, config) {
    try {
      const retryCount = (message.retryCount || 0) + 1;
      
      logger.info(`🔄 Retrying message ${message.id} (attempt ${retryCount})`);

      // Update message retry info
      await BlastMessage.update({
        retryCount,
        lastRetryAt: new Date(),
        status: 'retrying'
      }, {
        where: { id: message.id }
      });

      // Update retry statistics
      await this.updateRetryStats(config, 'attempted');

      // Attempt to send the message
      // For now, we'll use a mock implementation since whatsappService doesn't exist
      // In production, this should integrate with actual WhatsApp sending service
      const result = await this.mockSendMessage(
        message.sessionId,
        message.phone,
        message.message,
        message.attachmentPath
      );

      if (result.success) {
        // Success - update message status
        await BlastMessage.update({
          status: 'sent',
          sentAt: new Date(),
          errorMessage: null
        }, {
          where: { id: message.id }
        });

        await this.updateRetryStats(config, 'succeeded');
        logger.info(`✅ Retry successful for message ${message.id}`);

      } else {
        // Failed again - update with new error
        const shouldGiveUp = retryCount >= (config.maxRetries || 3);
        
        await BlastMessage.update({
          status: shouldGiveUp ? 'failed_final' : 'failed',
          errorMessage: result.error || 'Retry failed',
        }, {
          where: { id: message.id }
        });

        await this.updateRetryStats(config, 'failed');
        
        if (shouldGiveUp) {
          logger.warn(`❌ Giving up on message ${message.id} after ${retryCount} attempts`);
        }
      }

    } catch (error) {
      logger.error(`❌ Error retrying message ${message.id}:`, error);
      
      // Update message with error
      await BlastMessage.update({
        status: 'failed',
        errorMessage: `Retry error: ${error.message}`
      }, {
        where: { id: message.id }
      });

      await this.updateRetryStats(config, 'failed');
    }
  }

  /**
   * Check if current time is within business hours
   * @param {object} config - Retry configuration
   * @returns {boolean} True if within business hours
   */
  isWithinBusinessHours(config) {
    if (!config.respectBusinessHours) {
      return true; // Always allow if business hours not configured
    }

    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.

    // Check if current day is in allowed days
    const allowedDays = config.businessDays || [1, 2, 3, 4, 5]; // Monday to Friday
    if (!allowedDays.includes(currentDay)) {
      return false;
    }

    // Check if current hour is within business hours
    const startHour = config.businessHoursStart || 9;
    const endHour = config.businessHoursEnd || 17;
    
    return currentHour >= startHour && currentHour < endHour;
  }

  /**
   * Check rate limits for retries
   * @param {object} config - Retry configuration
   * @returns {boolean} True if within rate limits
   */
  async checkRateLimit(config) {
    if (!config.rateLimitPerHour) {
      return true; // No rate limit configured
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    const recentRetries = await BlastMessage.count({
      where: {
        sessionId: config.sessionId,
        lastRetryAt: { [Op.gte]: oneHourAgo }
      }
    });

    return recentRetries < config.rateLimitPerHour;
  }

  /**
   * Update retry statistics
   * @param {object} config - Retry configuration
   * @param {string} type - Type of update (attempted, succeeded, failed)
   */
  async updateRetryStats(config, type) {
    try {
      const updates = {
        updatedAt: new Date()
      };

      switch (type) {
        case 'attempted':
          updates.totalAttempted = (config.totalAttempted || 0) + 1;
          break;
        case 'succeeded':
          updates.totalSucceeded = (config.totalSucceeded || 0) + 1;
          break;
        case 'failed':
          updates.totalFailed = (config.totalFailed || 0) + 1;
          break;
      }

      await RetryConfiguration.update(updates, {
        where: { id: config.id }
      });

    } catch (error) {
      logger.error('❌ Error updating retry stats:', error);
    }
  }

  /**
   * Get retry status for a session
   * @param {string} sessionId - Blast session ID
   * @param {number} userId - User ID
   * @returns {object} Retry status information
   */
  async getRetryStatus(sessionId, userId) {
    try {
      const config = await RetryConfiguration.findOne({
        where: { sessionId, userId }
      });

      if (!config) {
        return { enabled: false, configured: false };
      }

      // Get retry statistics
      const failedMessages = await BlastMessage.count({
        where: { sessionId, status: 'failed' }
      });

      const retriedMessages = await BlastMessage.count({
        where: { 
          sessionId, 
          retryCount: { [Op.gt]: 0 }
        }
      });

      const successfulRetries = await BlastMessage.count({
        where: { 
          sessionId, 
          status: 'sent',
          retryCount: { [Op.gt]: 0 }
        }
      });

      return {
        enabled: config.isEnabled,
        configured: true,
        config: {
          maxRetries: config.maxRetries,
          retryDelay: config.retryDelay,
          batchSize: config.batchSize,
          respectBusinessHours: config.respectBusinessHours,
        },
        statistics: {
          totalAttempted: config.totalAttempted || 0,
          totalSucceeded: config.totalSucceeded || 0,
          totalFailed: config.totalFailed || 0,
          failedMessages,
          retriedMessages,
          successfulRetries,
          successRate: retriedMessages > 0 ? 
            Math.round((successfulRetries / retriedMessages) * 10000) / 100 : 0,
        },
        lastProcessed: config.updatedAt,
        nextRetryWindow: this.getNextRetryWindow(config),
      };

    } catch (error) {
      logger.error(`❌ Error getting retry status for session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Get next retry window
   * @param {object} config - Retry configuration
   * @returns {Date|null} Next retry time
   */
  getNextRetryWindow(config) {
    if (!config.isEnabled) return null;

    if (config.pausedUntil && config.pausedUntil > new Date()) {
      return config.pausedUntil;
    }

    // If respecting business hours, calculate next business hour window
    if (config.respectBusinessHours) {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(config.businessHoursStart || 9, 0, 0, 0);
      
      if (this.isWithinBusinessHours(config)) {
        return null; // Can retry now
      } else {
        return tomorrow;
      }
    }

    return null; // Can retry anytime
  }

  /**
   * Pause retries for a session
   * @param {string} sessionId - Session ID
   * @param {number} userId - User ID
   * @param {number} durationMinutes - Pause duration in minutes
   */
  async pauseRetries(sessionId, userId, durationMinutes = 60) {
    try {
      const pausedUntil = new Date(Date.now() + (durationMinutes * 60 * 1000));
      
      await RetryConfiguration.update(
        { pausedUntil, updatedAt: new Date() },
        { where: { sessionId, userId } }
      );

      logger.info(`⏸️ Retries paused for session ${sessionId} until ${pausedUntil}`);
      return { pausedUntil };

    } catch (error) {
      logger.error(`❌ Error pausing retries for session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Resume retries for a session
   * @param {string} sessionId - Session ID
   * @param {number} userId - User ID
   */
  async resumeRetries(sessionId, userId) {
    try {
      await RetryConfiguration.update(
        { pausedUntil: null, updatedAt: new Date() },
        { where: { sessionId, userId } }
      );

      logger.info(`▶️ Retries resumed for session ${sessionId}`);
      return { resumed: true };

    } catch (error) {
      logger.error(`❌ Error resuming retries for session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Clean up old retry configurations
   */
  async cleanupOldRetries() {
    try {
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      
      // Disable retry configs for completed sessions older than 1 week
      const result = await RetryConfiguration.update(
        { isEnabled: false },
        {
          where: {
            updatedAt: { [Op.lt]: oneWeekAgo },
            isEnabled: true
          }
        }
      );

      if (result[0] > 0) {
        logger.info(`🧹 Cleaned up ${result[0]} old retry configurations`);
      }

    } catch (error) {
      logger.error('❌ Error cleaning up old retries:', error);
    }
  }

  /**
   * Force retry specific messages
   * @param {array} messageIds - Array of message IDs to retry
   * @param {number} userId - User ID
   */
  async forceRetryMessages(messageIds, userId) {
    try {
      const messages = await BlastMessage.findAll({
        where: {
          id: { [Op.in]: messageIds },
          status: { [Op.in]: ['failed', 'failed_final'] }
        },
        include: [{
          model: BlastSession,
          where: { userId }
        }]
      });

      if (messages.length === 0) {
        throw new Error('No eligible messages found for retry');
      }

      const results = [];
      for (const message of messages) {
        // Get retry config for the session
        const config = await RetryConfiguration.findOne({
          where: { sessionId: message.sessionId }
        });

        if (!config) {
          // Create temporary config for force retry
          const tempConfig = {
            maxRetries: 1,
            delayBetweenMessages: 2000,
          };
          await this.retryMessage(message, tempConfig);
        } else {
          await this.retryMessage(message, config);
        }

        results.push({
          messageId: message.id,
          phone: message.phone,
          retried: true
        });
      }

      logger.info(`🔄 Force retried ${results.length} messages`);
      return results;

    } catch (error) {
      logger.error('❌ Error force retrying messages:', error);
      throw error;
    }
  }

  /**
   * Mock send message method (for development)
   * In production, this should be replaced with actual WhatsApp service integration
   * @param {string} sessionId - Session ID
   * @param {string} phone - Phone number
   * @param {string} message - Message text
   * @param {string} attachmentPath - Attachment path
   * @returns {object} Send result
   */
  async mockSendMessage(sessionId, phone, message, attachmentPath) {
    try {
      // Simulate network delay
      await this.sleep(1000 + Math.random() * 2000);
      
      // Simulate success/failure (70% success rate)
      const success = Math.random() > 0.3;
      
      if (success) {
        return { success: true };
      } else {
        return { 
          success: false, 
          error: 'Mock retry failed - network timeout' 
        };
      }
    } catch (error) {
      return { 
        success: false, 
        error: error.message 
      };
    }
  }

  /**
   * Utility function to sleep/delay
   * @param {number} ms - Milliseconds to sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get service status and statistics
   * @returns {object} Service status
   */
  getServiceStatus() {
    return {
      initialized: this.isInitialized,
      activeRetryJobs: this.retryJobs.size,
      currentRetryCount: this.currentRetryCount,
      maxConcurrentRetries: this.maxConcurrentRetries,
      uptime: process.uptime(),
    };
  }
}

// Export singleton instance
module.exports = new AutoRetryService();
