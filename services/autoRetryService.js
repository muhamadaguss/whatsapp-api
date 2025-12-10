const cron = require('node-cron');
const { Op } = require('sequelize');
const BlastSession = require('../models/blastSessionModel');
const BlastMessage = require('../models/blastMessageModel');
const RetryConfiguration = require('../models/retryConfigurationModel');
const blastExecutionService = require('./blastExecutionService');
const logger = require('../utils/logger');
class AutoRetryService {
  constructor() {
    this.retryJobs = new Map(); 
    this.isInitialized = false;
    this.maxConcurrentRetries = 5;
    this.currentRetryCount = 0;
  }
  async initialize() {
    try {
      if (this.isInitialized) {
        logger.warn('🔄 Auto Retry Service already initialized');
        return;
      }
      cron.schedule('* * * * *', async () => {
        await this.processRetryQueue();
      });
      cron.schedule('0 * * * *', async () => {
        await this.cleanupOldRetries();
      });
      this.isInitialized = true;
      logger.info('🚀 Auto Retry Service initialized successfully');
      await this.processRetryQueue();
    } catch (error) {
      logger.error('❌ Failed to initialize Auto Retry Service:', error);
      throw error;
    }
  }
  async enableAutoRetry(sessionId, config, userId) {
    try {
      const session = await BlastSession.findOne({
        where: { sessionId, userId }
      });
      if (!session) {
        throw new Error('Session not found or access denied');
      }
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
  async disableAutoRetry(sessionId, userId) {
    try {
      const result = await RetryConfiguration.update(
        { isEnabled: false, updatedAt: new Date() },
        { where: { sessionId, userId } }
      );
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
  async processRetryQueue() {
    try {
      if (this.currentRetryCount >= this.maxConcurrentRetries) {
        return; 
      }
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
  async processSessionRetries(config) {
    try {
      const sessionId = config.sessionId;
      if (!this.isWithinBusinessHours(config)) {
        return;
      }
      if (!await this.checkRateLimit(config)) {
        return;
      }
      const failedMessages = await this.getEligibleFailedMessages(config);
      if (failedMessages.length === 0) {
        return;
      }
      logger.info(`🔄 Processing ${failedMessages.length} retry messages for session ${sessionId}`);
      const batchSize = config.batchSize || 5;
      for (let i = 0; i < failedMessages.length; i += batchSize) {
        const batch = failedMessages.slice(i, i + batchSize);
        await this.processBatch(batch, config);
        if (i + batchSize < failedMessages.length) {
          await this.sleep(config.delayBetweenRetries || 30000);
        }
      }
    } catch (error) {
      logger.error(`❌ Error processing session retries for ${config.sessionId}:`, error);
    }
  }
  async getEligibleFailedMessages(config) {
    const now = new Date();
    const maxRetries = config.maxRetries || 3;
    const retryDelay = config.retryDelay || 300000; 
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
    if (config.skipErrorTypes && config.skipErrorTypes.length > 0) {
      whereConditions.errorMessage = {
        [Op.not]: {
          [Op.iLike]: {
            [Op.any]: config.skipErrorTypes.map(type => `%${type}%`)
          }
        }
      };
    }
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
  async processBatch(messages, config) {
    this.currentRetryCount++;
    try {
      for (const message of messages) {
        await this.retryMessage(message, config);
        await this.sleep(config.delayBetweenMessages || 2000);
      }
    } finally {
      this.currentRetryCount--;
    }
  }
  async retryMessage(message, config) {
    try {
      const retryCount = (message.retryCount || 0) + 1;
      logger.info(`🔄 Retrying message ${message.id} (attempt ${retryCount})`);
      await BlastMessage.update({
        retryCount,
        lastRetryAt: new Date(),
        status: 'retrying'
      }, {
        where: { id: message.id }
      });
      await this.updateRetryStats(config, 'attempted');
      const result = await this.mockSendMessage(
        message.sessionId,
        message.phone,
        message.message,
        message.attachmentPath
      );
      if (result.success) {
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
      await BlastMessage.update({
        status: 'failed',
        errorMessage: `Retry error: ${error.message}`
      }, {
        where: { id: message.id }
      });
      await this.updateRetryStats(config, 'failed');
    }
  }
  isWithinBusinessHours(config) {
    if (!config.respectBusinessHours) {
      return true; 
    }
    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay(); 
    const allowedDays = config.businessDays || [1, 2, 3, 4, 5]; 
    if (!allowedDays.includes(currentDay)) {
      return false;
    }
    const startHour = config.businessHoursStart || 9;
    const endHour = config.businessHoursEnd || 17;
    return currentHour >= startHour && currentHour < endHour;
  }
  async checkRateLimit(config) {
    if (!config.rateLimitPerHour) {
      return true; 
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
  async getRetryStatus(sessionId, userId) {
    try {
      const config = await RetryConfiguration.findOne({
        where: { sessionId, userId }
      });
      if (!config) {
        return { enabled: false, configured: false };
      }
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
  getNextRetryWindow(config) {
    if (!config.isEnabled) return null;
    if (config.pausedUntil && config.pausedUntil > new Date()) {
      return config.pausedUntil;
    }
    if (config.respectBusinessHours) {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(config.businessHoursStart || 9, 0, 0, 0);
      if (this.isWithinBusinessHours(config)) {
        return null; 
      } else {
        return tomorrow;
      }
    }
    return null; 
  }
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
  async cleanupOldRetries() {
    try {
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
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
        const config = await RetryConfiguration.findOne({
          where: { sessionId: message.sessionId }
        });
        if (!config) {
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
  async mockSendMessage(sessionId, phone, message, attachmentPath) {
    try {
      await this.sleep(1000 + Math.random() * 2000);
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
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
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
module.exports = new AutoRetryService();
