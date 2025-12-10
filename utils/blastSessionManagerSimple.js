const logger = require("./logger");
class BlastSessionManager {
  constructor() {
    this.activeSessions = new Map(); 
  }
  getDefaultConfig() {
    return {
      messageDelay: { min: 2, max: 10 }, 
      contactDelay: { min: 30, max: 120 }, 
      restDelay: { min: 10, max: 30 }, 
      dailyLimit: { min: 200, max: 300 }, 
      restThreshold: { min: 50, max: 100 }, 
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
        retryDelay: 60, 
      },
    };
  }
  getActiveSessions() {
    return Array.from(this.activeSessions.values());
  }
  isSessionActive(sessionId) {
    return this.activeSessions.has(sessionId);
  }
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
module.exports = new BlastSessionManager();
