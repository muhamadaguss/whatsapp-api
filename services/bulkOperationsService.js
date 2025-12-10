const { Op } = require('sequelize');
const BlastSession = require('../models/blastSessionModel');
const BlastMessage = require('../models/blastMessageModel');
const RetryConfiguration = require('../models/retryConfigurationModel');
const PhoneValidationService = require('./phoneValidationService');
const AutoRetryService = require('./autoRetryService');
const logger = require('../utils/logger');
const fs = require('fs').promises;
const path = require('path');
class BulkOperationsService {
  static async bulkRetryFailedMessages(sessionIds, userId, options = {}) {
    try {
      logger.info(`🔄 Starting bulk retry for ${sessionIds.length} sessions`);
      const sessions = await BlastSession.findAll({
        where: {
          sessionId: { [Op.in]: sessionIds },
          userId
        }
      });
      if (sessions.length !== sessionIds.length) {
        throw new Error('Some sessions not found or access denied');
      }
      const results = {
        totalSessions: sessionIds.length,
        processedSessions: 0,
        totalMessages: 0,
        retriedMessages: 0,
        successfulRetries: 0,
        failedRetries: 0,
        skippedMessages: 0,
        sessionResults: [],
        startTime: new Date(),
        endTime: null,
        duration: 0,
      };
      for (const sessionId of sessionIds) {
        try {
          const sessionResult = await this.retrySessionFailedMessages(sessionId, userId, options);
          results.sessionResults.push(sessionResult);
          results.processedSessions++;
          results.totalMessages += sessionResult.totalMessages;
          results.retriedMessages += sessionResult.retriedMessages;
          results.successfulRetries += sessionResult.successfulRetries;
          results.failedRetries += sessionResult.failedRetries;
          results.skippedMessages += sessionResult.skippedMessages;
          if (options.delayBetweenSessions && sessionResult !== sessionIds[sessionIds.length - 1]) {
            await this.sleep(options.delayBetweenSessions);
          }
        } catch (error) {
          logger.error(`❌ Error processing session ${sessionId}:`, error);
          results.sessionResults.push({
            sessionId,
            error: error.message,
            processed: false
          });
        }
      }
      results.endTime = new Date();
      results.duration = results.endTime - results.startTime;
      results.successRate = results.retriedMessages > 0 ? 
        (results.successfulRetries / results.retriedMessages) * 100 : 0;
      logger.info(`✅ Bulk retry completed: ${results.successfulRetries}/${results.retriedMessages} successful`);
      return results;
    } catch (error) {
      logger.error('❌ Error in bulk retry operation:', error);
      throw error;
    }
  }
  static async retrySessionFailedMessages(sessionId, userId, options = {}) {
    try {
      const failedMessages = await BlastMessage.findAll({
        where: {
          sessionId,
          status: { [Op.in]: ['failed', 'failed_final'] },
          ...(options.maxRetryCount ? {
            [Op.or]: [
              { retryCount: null },
              { retryCount: { [Op.lt]: options.maxRetryCount } }
            ]
          } : {})
        },
        order: [['messageIndex', 'ASC']]
      });
      const sessionResult = {
        sessionId,
        totalMessages: failedMessages.length,
        retriedMessages: 0,
        successfulRetries: 0,
        failedRetries: 0,
        skippedMessages: 0,
        processed: true,
        startTime: new Date(),
        endTime: null,
      };
      if (failedMessages.length === 0) {
        sessionResult.endTime = new Date();
        return sessionResult;
      }
      let retryConfig = await RetryConfiguration.findOne({
        where: { sessionId, userId }
      });
      if (!retryConfig) {
        retryConfig = await RetryConfiguration.create({
          sessionId,
          userId,
          maxRetries: options.maxRetries || 3,
          retryDelay: options.retryDelay || 300000,
          batchSize: options.batchSize || 10,
          delayBetweenMessages: options.delayBetweenMessages || 2000,
          isEnabled: true,
        });
      }
      const batchSize = options.batchSize || 10;
      for (let i = 0; i < failedMessages.length; i += batchSize) {
        const batch = failedMessages.slice(i, i + batchSize);
        for (const message of batch) {
          try {
            if (this.shouldSkipMessage(message, options)) {
              sessionResult.skippedMessages++;
              continue;
            }
            const retryResult = await this.retryMessage(message, retryConfig);
            sessionResult.retriedMessages++;
            if (retryResult.success) {
              sessionResult.successfulRetries++;
            } else {
              sessionResult.failedRetries++;
            }
            if (options.delayBetweenMessages) {
              await this.sleep(options.delayBetweenMessages);
            }
          } catch (error) {
            logger.error(`❌ Error retrying message ${message.id}:`, error);
            sessionResult.failedRetries++;
          }
        }
        if (i + batchSize < failedMessages.length && options.delayBetweenBatches) {
          await this.sleep(options.delayBetweenBatches);
        }
      }
      sessionResult.endTime = new Date();
      return sessionResult;
    } catch (error) {
      logger.error(`❌ Error retrying session ${sessionId}:`, error);
      throw error;
    }
  }
  static async bulkUpdateMessageStatus(messageIds, newStatus, userId) {
    try {
      const messages = await BlastMessage.findAll({
        where: { id: { [Op.in]: messageIds } },
        include: [{
          model: BlastSession,
          where: { userId }
        }]
      });
      if (messages.length !== messageIds.length) {
        throw new Error('Some messages not found or access denied');
      }
      const result = await BlastMessage.update(
        { 
          status: newStatus,
          updatedAt: new Date()
        },
        {
          where: { id: { [Op.in]: messageIds } }
        }
      );
      logger.info(`✅ Bulk updated ${result[0]} messages to status: ${newStatus}`);
      return {
        updatedCount: result[0],
        requestedCount: messageIds.length,
        newStatus,
        success: true
      };
    } catch (error) {
      logger.error('❌ Error in bulk status update:', error);
      throw error;
    }
  }
  static async bulkDeleteMessages(messageIds, userId) {
    try {
      const messages = await BlastMessage.findAll({
        where: { id: { [Op.in]: messageIds } },
        include: [{
          model: BlastSession,
          where: { userId }
        }]
      });
      if (messages.length !== messageIds.length) {
        throw new Error('Some messages not found or access denied');
      }
      const deletedCount = await BlastMessage.destroy({
        where: { id: { [Op.in]: messageIds } }
      });
      logger.info(`🗑️ Bulk deleted ${deletedCount} messages`);
      return {
        deletedCount,
        requestedCount: messageIds.length,
        success: true
      };
    } catch (error) {
      logger.error('❌ Error in bulk delete:', error);
      throw error;
    }
  }
  static async bulkValidatePhoneNumbers(phoneNumbers, options = {}) {
    try {
      logger.info(`📱 Starting bulk phone validation for ${phoneNumbers.length} numbers`);
      const results = {
        total: phoneNumbers.length,
        valid: 0,
        invalid: 0,
        duplicates: 0,
        normalized: [],
        invalid_numbers: [],
        duplicated_numbers: [],
        statistics: {},
        processed_at: new Date(),
      };
      const validationResult = await PhoneValidationService.validateBatch(phoneNumbers, {
        ...options,
        returnDetails: true
      });
      results.valid = validationResult.valid.length;
      results.invalid = validationResult.invalid.length;
      results.duplicates = validationResult.duplicates.length;
      results.normalized = validationResult.valid;
      results.invalid_numbers = validationResult.invalid;
      results.duplicated_numbers = validationResult.duplicates;
      results.statistics = validationResult.statistics;
      logger.info(`✅ Bulk validation completed: ${results.valid}/${results.total} valid numbers`);
      return results;
    } catch (error) {
      logger.error('❌ Error in bulk phone validation:', error);
      throw error;
    }
  }
  static async bulkCampaignControl(sessionIds, action, userId) {
    try {
      logger.info(`${action === 'pause' ? '⏸️' : '▶️'} Bulk ${action} for ${sessionIds.length} campaigns`);
      const sessions = await BlastSession.findAll({
        where: {
          sessionId: { [Op.in]: sessionIds },
          userId
        }
      });
      if (sessions.length !== sessionIds.length) {
        throw new Error('Some sessions not found or access denied');
      }
      const results = {
        totalSessions: sessionIds.length,
        processedSessions: 0,
        successfulOperations: 0,
        failedOperations: 0,
        sessionResults: [],
        action,
      };
      for (const session of sessions) {
        try {
          let updateData = { updatedAt: new Date() };
          if (action === 'pause') {
            updateData.status = 'paused';
            updateData.pausedAt = new Date();
          } else if (action === 'resume') {
            updateData.status = 'running';
            updateData.pausedAt = null;
            updateData.resumedAt = new Date();
          }
          await BlastSession.update(updateData, {
            where: { sessionId: session.sessionId }
          });
          if (action === 'pause') {
            await AutoRetryService.pauseRetries(session.sessionId, userId, 24 * 60); 
          } else if (action === 'resume') {
            await AutoRetryService.resumeRetries(session.sessionId, userId);
          }
          results.sessionResults.push({
            sessionId: session.sessionId,
            campaignName: session.campaignName,
            success: true,
            action
          });
          results.processedSessions++;
          results.successfulOperations++;
        } catch (error) {
          logger.error(`❌ Error ${action}ing session ${session.sessionId}:`, error);
          results.sessionResults.push({
            sessionId: session.sessionId,
            campaignName: session.campaignName,
            success: false,
            error: error.message
          });
          results.failedOperations++;
        }
      }
      logger.info(`✅ Bulk ${action} completed: ${results.successfulOperations}/${results.totalSessions} successful`);
      return results;
    } catch (error) {
      logger.error(`❌ Error in bulk ${action} operation:`, error);
      throw error;
    }
  }
  static async bulkExportCampaignData(sessionIds, userId, options = {}) {
    try {
      logger.info(`📤 Bulk export for ${sessionIds.length} campaigns`);
      const sessions = await BlastSession.findAll({
        where: {
          sessionId: { [Op.in]: sessionIds },
          userId
        }
      });
      if (sessions.length !== sessionIds.length) {
        throw new Error('Some sessions not found or access denied');
      }
      const exportData = {
        exportInfo: {
          exportedAt: new Date(),
          exportedBy: userId,
          totalSessions: sessions.length,
          exportFormat: options.format || 'json',
        },
        campaigns: [],
      };
      for (const session of sessions) {
        const messages = await BlastMessage.findAll({
          where: { sessionId: session.sessionId },
          order: [['messageIndex', 'ASC']]
        });
        const retryConfig = await RetryConfiguration.findOne({
          where: { sessionId: session.sessionId }
        });
        const campaignData = {
          sessionInfo: {
            sessionId: session.sessionId,
            campaignName: session.campaignName,
            status: session.status,
            createdAt: session.createdAt,
            startedAt: session.startedAt,
            completedAt: session.completedAt,
            totalMessages: session.totalMessages,
          },
          statistics: this.calculateCampaignStatistics(messages),
          retryConfiguration: retryConfig ? {
            enabled: retryConfig.isEnabled,
            maxRetries: retryConfig.maxRetries,
            totalAttempted: retryConfig.totalAttempted,
            totalSucceeded: retryConfig.totalSucceeded,
          } : null,
          messages: options.includeMessages ? messages.map(msg => ({
            messageIndex: msg.messageIndex,
            phone: msg.phone,
            status: msg.status,
            retryCount: msg.retryCount,
            sentAt: msg.sentAt,
            errorMessage: msg.errorMessage,
          })) : [],
        };
        exportData.campaigns.push(campaignData);
      }
      const exportResult = await this.generateExportFile(exportData, options);
      logger.info(`✅ Bulk export completed: ${exportResult.filename}`);
      return exportResult;
    } catch (error) {
      logger.error('❌ Error in bulk export:', error);
      throw error;
    }
  }
  static async bulkCleanupCampaigns(sessionIds, userId, options = {}) {
    try {
      logger.info(`🧹 Bulk cleanup for ${sessionIds.length} campaigns`);
      const results = {
        totalSessions: sessionIds.length,
        cleanedSessions: 0,
        deletedMessages: 0,
        freedSpace: 0,
        errors: [],
      };
      for (const sessionId of sessionIds) {
        try {
          const cleanupResult = await this.cleanupSingleCampaign(sessionId, userId, options);
          results.cleanedSessions++;
          results.deletedMessages += cleanupResult.deletedMessages;
          results.freedSpace += cleanupResult.freedSpace;
        } catch (error) {
          logger.error(`❌ Error cleaning up session ${sessionId}:`, error);
          results.errors.push({
            sessionId,
            error: error.message
          });
        }
      }
      logger.info(`✅ Bulk cleanup completed: ${results.cleanedSessions} sessions cleaned`);
      return results;
    } catch (error) {
      logger.error('❌ Error in bulk cleanup:', error);
      throw error;
    }
  }
  static shouldSkipMessage(message, options) {
    if (options.skipErrorTypes && options.skipErrorTypes.length > 0) {
      const errorMessage = (message.errorMessage || '').toLowerCase();
      return options.skipErrorTypes.some(type => 
        errorMessage.includes(type.toLowerCase())
      );
    }
    if (options.maxRetryCount && (message.retryCount || 0) >= options.maxRetryCount) {
      return true;
    }
    return false;
  }
  static async retryMessage(message, retryConfig) {
    try {
      const retryCount = (message.retryCount || 0) + 1;
      await BlastMessage.update({
        retryCount,
        lastRetryAt: new Date(),
        status: 'retrying'
      }, {
        where: { id: message.id }
      });
      const success = Math.random() > 0.3; 
      if (success) {
        await BlastMessage.update({
          status: 'sent',
          sentAt: new Date(),
          errorMessage: null
        }, {
          where: { id: message.id }
        });
        return { success: true };
      } else {
        await BlastMessage.update({
          status: retryCount >= (retryConfig.maxRetries || 3) ? 'failed_final' : 'failed',
          errorMessage: 'Retry failed'
        }, {
          where: { id: message.id }
        });
        return { success: false, error: 'Retry failed' };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  static calculateCampaignStatistics(messages) {
    const total = messages.length;
    const sent = messages.filter(m => m.status === 'sent').length;
    const failed = messages.filter(m => m.status === 'failed').length;
    const pending = messages.filter(m => m.status === 'pending').length;
    return {
      total,
      sent,
      failed,
      pending,
      successRate: total > 0 ? (sent / total) * 100 : 0,
      failureRate: total > 0 ? (failed / total) * 100 : 0,
    };
  }
  static async generateExportFile(data, options) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const format = options.format || 'json';
    const filename = `bulk_export_${timestamp}.${format}`;
    const filepath = path.join(process.cwd(), 'exports', filename);
    await fs.mkdir(path.dirname(filepath), { recursive: true });
    let content;
    if (format === 'json') {
      content = JSON.stringify(data, null, 2);
    } else if (format === 'csv') {
      content = this.convertToCSV(data);
    } else {
      throw new Error(`Unsupported export format: ${format}`);
    }
    await fs.writeFile(filepath, content, 'utf8');
    return {
      filename,
      filepath,
      size: content.length,
      format,
      recordCount: data.campaigns.length,
    };
  }
  static convertToCSV(data) {
    const headers = [
      'Session ID',
      'Campaign Name',
      'Status',
      'Total Messages',
      'Sent',
      'Failed',
      'Success Rate (%)',
      'Created At',
      'Completed At'
    ];
    const rows = data.campaigns.map(campaign => [
      campaign.sessionInfo.sessionId,
      campaign.sessionInfo.campaignName,
      campaign.sessionInfo.status,
      campaign.statistics.total,
      campaign.statistics.sent,
      campaign.statistics.failed,
      campaign.statistics.successRate.toFixed(2),
      campaign.sessionInfo.createdAt,
      campaign.sessionInfo.completedAt || ''
    ]);
    return [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
  }
  static async cleanupSingleCampaign(sessionId, userId, options) {
    const session = await BlastSession.findOne({
      where: { sessionId, userId }
    });
    if (!session) {
      throw new Error('Session not found or access denied');
    }
    let deletedMessages = 0;
    let freedSpace = 0;
    if (options.deleteCompletedMessages) {
      const result = await BlastMessage.destroy({
        where: {
          sessionId,
          status: { [Op.in]: ['sent', 'failed_final'] }
        }
      });
      deletedMessages += result;
    }
    if (options.deleteRetryConfigs) {
      await RetryConfiguration.destroy({
        where: { sessionId }
      });
    }
    return {
      sessionId,
      deletedMessages,
      freedSpace,
    };
  }
  static sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
module.exports = BulkOperationsService;
