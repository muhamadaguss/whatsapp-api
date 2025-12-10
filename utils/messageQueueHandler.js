const logger = require("./logger");
const BlastMessage = require("../models/blastMessageModel");
const SpinTextEngine = require("./spinTextEngine");
class MessageQueueHandler {
  constructor() {
    this.processingQueues = new Map(); 
  }
  processMessageTemplate(message) {
    try {
      let finalMessage = message.messageTemplate;
      if (message.variables && typeof message.variables === "object") {
        for (const [key, value] of Object.entries(message.variables)) {
          const regex = new RegExp(`{${key}}`, "gi");
          finalMessage = finalMessage.replace(regex, value || "");
        }
      }
      finalMessage = SpinTextEngine.parseSpinText(finalMessage);
      return finalMessage.trim();
    } catch (error) {
      logger.error(`❌ Error processing message template:`, error);
      return message.messageTemplate; 
    }
  }
  async prepareMessage(message) {
    try {
      const finalMessage = this.processMessageTemplate(message);
      await message.update({ finalMessage });
      const formattedPhone = this.formatPhoneNumber(message.phone);
      return {
        id: message.id,
        sessionId: message.sessionId,
        messageIndex: message.messageIndex,
        phone: formattedPhone,
        contactName: message.contactName,
        originalTemplate: message.messageTemplate,
        finalMessage,
        variables: message.variables,
        retryCount: message.retryCount,
        maxRetries: message.maxRetries,
      };
    } catch (error) {
      logger.error(`❌ Error preparing message ${message.id}:`, error);
      throw error;
    }
  }
  formatPhoneNumber(phone) {
    let cleaned = phone.replace(/\D/g, "");
    if (cleaned.startsWith("0")) {
      cleaned = "62" + cleaned.substring(1); 
    } else if (!cleaned.startsWith("62")) {
      cleaned = "62" + cleaned;
    }
    return cleaned;
  }
  shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
  applyNonSequentialOrder(messages) {
    if (messages.length <= 1) return messages;
    const shufflePercentage = 0.15 + Math.random() * 0.05; 
    const shuffleCount = Math.floor(messages.length * shufflePercentage);
    if (shuffleCount === 0) return messages;
    const toShuffle = [];
    const indices = new Set();
    while (indices.size < shuffleCount) {
      indices.add(Math.floor(Math.random() * messages.length));
    }
    const indicesArray = Array.from(indices).sort((a, b) => a - b);
    for (const idx of indicesArray) {
      toShuffle.push(messages[idx]);
    }
    const shuffled = this.shuffleArray(toShuffle);
    let shuffledIdx = 0;
    for (const idx of indicesArray) {
      messages[idx] = shuffled[shuffledIdx++];
    }
    logger.info(`🔀 Shuffled ${shuffleCount}/${messages.length} messages (${(shufflePercentage * 100).toFixed(1)}%)`);
    return messages;
  }
  async getNextBatch(sessionId, batchSize = 10, enableShuffle = true) {
    try {
      logger.info(`🔍 Getting next batch of ${batchSize} messages for session ${sessionId}`);
      const pendingMessages = await BlastMessage.findPendingBySession(
        sessionId,
        batchSize
      );
      logger.info(`📋 Found ${pendingMessages.length} pending messages for session ${sessionId}`);
      if (pendingMessages.length > 0) {
        const phones = pendingMessages.map(m => m.phone).join(', ');
        logger.info(`📱 Pending phone numbers: ${phones}`);
      }
      let messages = pendingMessages;
      if (messages.length < batchSize) {
        const retryableMessages = await BlastMessage.findRetryableBySession(
          sessionId,
          batchSize - messages.length
        );
        logger.info(`🔄 Found ${retryableMessages.length} retryable messages for session ${sessionId}`);
        messages = [...messages, ...retryableMessages];
      }
      if (enableShuffle && messages.length > 1) {
        messages = this.applyNonSequentialOrder(messages);
      }
      const preparedMessages = [];
      for (const message of messages) {
        try {
          const prepared = await this.prepareMessage(message);
          preparedMessages.push(prepared);
        } catch (error) {
          logger.error(`❌ Failed to prepare message ${message.id}:`, error);
          await message.markAsFailed(`Preparation failed: ${error.message}`);
        }
      }
      logger.info(
        `📦 Prepared ${preparedMessages.length} messages for session ${sessionId}`
      );
      return preparedMessages;
    } catch (error) {
      logger.error(`❌ Error getting next batch for ${sessionId}:`, error);
      throw error;
    }
  }
  async markAsProcessing(messageId) {
    try {
      const message = await BlastMessage.findByPk(messageId);
      if (!message) {
        throw new Error(`Message ${messageId} not found`);
      }
      await message.markAsProcessing();
      return message;
    } catch (error) {
      logger.error(
        `❌ Error marking message ${messageId} as processing:`,
        error
      );
      throw error;
    }
  }
  async markAsSent(messageId, whatsappMessageId) {
    try {
      const message = await BlastMessage.findByPk(messageId);
      if (!message) {
        throw new Error(`Message ${messageId} not found`);
      }
      await message.markAsSent(whatsappMessageId);
      logger.info(`✅ Message ${messageId} marked as sent`);
      return message;
    } catch (error) {
      logger.error(`❌ Error marking message ${messageId} as sent:`, error);
      throw error;
    }
  }
  async markAsFailed(messageId, errorMessage) {
    try {
      const message = await BlastMessage.findByPk(messageId);
      if (!message) {
        throw new Error(`Message ${messageId} not found`);
      }
      await message.markAsFailed(errorMessage);
      logger.warn(`⚠️ Message ${messageId} marked as failed: ${errorMessage}`);
      return message;
    } catch (error) {
      logger.error(`❌ Error marking message ${messageId} as failed:`, error);
      throw error;
    }
  }
  async markAsSkipped(messageId, reason) {
    try {
      const message = await BlastMessage.findByPk(messageId);
      if (!message) {
        throw new Error(`Message ${messageId} not found`);
      }
      await message.markAsSkipped(reason);
      logger.info(`⏭️ Message ${messageId} marked as skipped: ${reason}`);
      return message;
    } catch (error) {
      logger.error(`❌ Error marking message ${messageId} as skipped:`, error);
      throw error;
    }
  }
  async getQueueStats(sessionId) {
    try {
      const stats = await BlastMessage.getSessionStats(sessionId);
      const statsMap = stats.reduce((acc, stat) => {
        acc[stat.status] = parseInt(stat.count);
        return acc;
      }, {});
      const total = Object.values(statsMap).reduce(
        (sum, count) => sum + count,
        0
      );
      const completed =
        (statsMap.sent || 0) + (statsMap.failed || 0) + (statsMap.skipped || 0);
      const remaining = (statsMap.pending || 0) + (statsMap.processing || 0);
      return {
        total,
        completed,
        remaining,
        pending: statsMap.pending || 0,
        processing: statsMap.processing || 0,
        sent: statsMap.sent || 0,
        failed: statsMap.failed || 0,
        skipped: statsMap.skipped || 0,
        successRate:
          total > 0 ? (((statsMap.sent || 0) / total) * 100).toFixed(2) : 0,
        completionRate: total > 0 ? ((completed / total) * 100).toFixed(2) : 0,
      };
    } catch (error) {
      logger.error(`❌ Error getting queue stats for ${sessionId}:`, error);
      throw error;
    }
  }
  async cleanupOldMessages(sessionId, daysOld = 7) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);
      const deletedCount = await BlastMessage.destroy({
        where: {
          sessionId,
          status: ["sent", "failed", "skipped"],
          updatedAt: {
            [require("sequelize").Op.lt]: cutoffDate,
          },
        },
      });
      if (deletedCount > 0) {
        logger.info(
          `🗑️ Cleaned up ${deletedCount} old messages for session ${sessionId}`
        );
      }
      return deletedCount;
    } catch (error) {
      logger.error(
        `❌ Error cleaning up old messages for ${sessionId}:`,
        error
      );
      throw error;
    }
  }
  async resetFailedMessages(sessionId, maxRetries = 3) {
    try {
      const [updatedCount] = await BlastMessage.update(
        {
          status: "pending",
          errorMessage: null,
          failedAt: null,
        },
        {
          where: {
            sessionId,
            status: "failed",
            retryCount: {
              [require("sequelize").Op.lt]: maxRetries,
            },
          },
        }
      );
      if (updatedCount > 0) {
        logger.info(
          `🔄 Reset ${updatedCount} failed messages for retry in session ${sessionId}`
        );
      }
      return updatedCount;
    } catch (error) {
      logger.error(
        `❌ Error resetting failed messages for ${sessionId}:`,
        error
      );
      throw error;
    }
  }
  getProcessingState(sessionId) {
    return (
      this.processingQueues.get(sessionId) || {
        isProcessing: false,
        currentBatch: [],
        startedAt: null,
      }
    );
  }
  setProcessingState(sessionId, state) {
    this.processingQueues.set(sessionId, {
      ...this.getProcessingState(sessionId),
      ...state,
    });
  }
  clearProcessingState(sessionId) {
    this.processingQueues.delete(sessionId);
  }
}
module.exports = new MessageQueueHandler();
