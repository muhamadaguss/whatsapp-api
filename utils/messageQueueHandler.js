const logger = require("./logger");
const BlastMessage = require("../models/blastMessageModel");
const SpinTextEngine = require("./spinTextEngine");

/**
 * MessageQueueHandler - Handles message queue operations
 * Manages message processing, spin text generation, and variable replacement
 */
class MessageQueueHandler {
  constructor() {
    this.processingQueues = new Map(); // sessionId -> processing state
  }

  /**
   * Process message template with spin text and variables
   * @param {Object} message - Message object from database
   * @returns {string} - Final processed message
   */
  processMessageTemplate(message) {
    try {
      let finalMessage = message.messageTemplate;

      // First, replace variables like {nama}, {company}, etc.
      if (message.variables && typeof message.variables === "object") {
        for (const [key, value] of Object.entries(message.variables)) {
          const regex = new RegExp(`{${key}}`, "gi");
          finalMessage = finalMessage.replace(regex, value || "");
        }
      }

      // Then, process spin text
      finalMessage = SpinTextEngine.parseSpinText(finalMessage);

      return finalMessage.trim();
    } catch (error) {
      logger.error(`❌ Error processing message template:`, error);
      return message.messageTemplate; // Return original if error
    }
  }

  /**
   * Prepare message for sending
   * @param {Object} message - BlastMessage instance
   * @returns {Object} - Prepared message data
   */
  async prepareMessage(message) {
    try {
      // Process the template
      const finalMessage = this.processMessageTemplate(message);

      // Update the message with final processed text
      await message.update({ finalMessage });

      // Format phone number
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

  /**
   * Format phone number for WhatsApp
   * @param {string} phone - Raw phone number
   * @returns {string} - Formatted phone number
   */
  formatPhoneNumber(phone) {
    // Remove all non-digit characters
    let cleaned = phone.replace(/\D/g, "");

    // Add country code if missing
    if (cleaned.startsWith("0")) {
      cleaned = "62" + cleaned.substring(1); // Indonesia
    } else if (!cleaned.startsWith("62")) {
      cleaned = "62" + cleaned;
    }

    return cleaned;
  }

  /**
   * Get next batch of messages to process
   * @param {string} sessionId - Session ID
   * @param {number} batchSize - Number of messages to get
   * @returns {Array} - Array of prepared messages
   */
  async getNextBatch(sessionId, batchSize = 10) {
    try {
      // Get pending messages
      const pendingMessages = await BlastMessage.findPendingBySession(
        sessionId,
        batchSize
      );

      // If not enough pending, get retryable failed messages
      let messages = pendingMessages;
      if (messages.length < batchSize) {
        const retryableMessages = await BlastMessage.findRetryableBySession(
          sessionId,
          batchSize - messages.length
        );
        messages = [...messages, ...retryableMessages];
      }

      // Prepare all messages
      const preparedMessages = [];
      for (const message of messages) {
        try {
          const prepared = await this.prepareMessage(message);
          preparedMessages.push(prepared);
        } catch (error) {
          logger.error(`❌ Failed to prepare message ${message.id}:`, error);
          // Mark message as failed
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

  /**
   * Mark message as processing
   * @param {number} messageId - Message ID
   * @returns {Object} - Updated message
   */
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

  /**
   * Mark message as sent
   * @param {number} messageId - Message ID
   * @param {string} whatsappMessageId - WhatsApp message ID
   * @returns {Object} - Updated message
   */
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

  /**
   * Mark message as failed
   * @param {number} messageId - Message ID
   * @param {string} errorMessage - Error message
   * @returns {Object} - Updated message
   */
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

  /**
   * Mark message as skipped
   * @param {number} messageId - Message ID
   * @param {string} reason - Skip reason
   * @returns {Object} - Updated message
   */
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

  /**
   * Get queue statistics for a session
   * @param {string} sessionId - Session ID
   * @returns {Object} - Queue statistics
   */
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

  /**
   * Clean up old processed messages
   * @param {string} sessionId - Session ID
   * @param {number} daysOld - Days old to clean up (default: 7)
   * @returns {number} - Number of cleaned messages
   */
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

  /**
   * Reset failed messages for retry
   * @param {string} sessionId - Session ID
   * @param {number} maxRetries - Max retries allowed
   * @returns {number} - Number of reset messages
   */
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

  /**
   * Get processing state for session
   * @param {string} sessionId - Session ID
   * @returns {Object} - Processing state
   */
  getProcessingState(sessionId) {
    return (
      this.processingQueues.get(sessionId) || {
        isProcessing: false,
        currentBatch: [],
        startedAt: null,
      }
    );
  }

  /**
   * Set processing state for session
   * @param {string} sessionId - Session ID
   * @param {Object} state - Processing state
   */
  setProcessingState(sessionId, state) {
    this.processingQueues.set(sessionId, {
      ...this.getProcessingState(sessionId),
      ...state,
    });
  }

  /**
   * Clear processing state for session
   * @param {string} sessionId - Session ID
   */
  clearProcessingState(sessionId) {
    this.processingQueues.delete(sessionId);
  }
}

// Export singleton instance
module.exports = new MessageQueueHandler();
