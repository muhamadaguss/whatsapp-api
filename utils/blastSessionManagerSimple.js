const logger = require("./logger");

/**
 * BlastSessionManager - Simple version for Phase 1 testing
 * Core class untuk mengelola blast sessions (without database)
 */
class BlastSessionManager {
  constructor() {
    this.activeSessions = new Map(); // In-memory session tracking
  }

  /**
   * Get default configuration
   * @returns {Object} - Default config
   */
  getDefaultConfig() {
    return {
      messageDelay: { min: 2, max: 10 }, // seconds
      contactDelay: { min: 30, max: 120 }, // seconds
      restDelay: { min: 10, max: 30 }, // minutes
      dailyLimit: { min: 200, max: 300 }, // messages
      restThreshold: { min: 50, max: 100 }, // messages
      businessHours: {
        enabled: true,
        startHour: 8,
        endHour: 21,
        excludeWeekends: true,
        excludeLunchBreak: true,
        lunchStart: 12,
        lunchEnd: 13,
      },
      retryConfig: {
        maxRetries: 3,
        retryDelay: 60, // seconds
      },
    };
  }

  /**
   * Get all active sessions
   * @returns {Array} - Active sessions
   */
  getActiveSessions() {
    return Array.from(this.activeSessions.values());
  }

  /**
   * Check if session is active in memory
   * @param {string} sessionId - Session ID
   * @returns {boolean} - Is active
   */
  isSessionActive(sessionId) {
    return this.activeSessions.has(sessionId);
  }

  /**
   * Create new blast session (simple version)
   * @param {Object} params - Session parameters
   * @returns {Object} - Created session
   */
  async createSession({
    userId,
    whatsappSessionId,
    campaignName,
    messageTemplate,
    messageList,
    config = {},
  }) {
    const sessionId = `blast_${Date.now()}_${Math.random()
      .toString(36)
      .substring(7)}`;

    try {
      logger.info(
        `✅ Blast session created: ${sessionId} with ${messageList.length} messages`
      );

      return {
        success: true,
        sessionId,
        totalMessages: messageList.length,
      };
    } catch (error) {
      logger.error(`❌ Failed to create blast session:`, error);
      throw new Error(`Failed to create blast session: ${error.message}`);
    }
  }
}

// Export singleton instance
module.exports = new BlastSessionManager();
