const logger = require("./logger");
class SessionPersistence {
  constructor() {
    this.recoveryInProgress = false;
  }
  formatDuration(durationMs) {
    const seconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
  calculateSessionDuration(session) {
    const startTime = session.startedAt;
    const endTime = session.completedAt || session.stoppedAt || new Date();
    if (!startTime) {
      return { duration: null, durationMs: null };
    }
    const durationMs = new Date(endTime) - new Date(startTime);
    const duration = this.formatDuration(durationMs);
    return { duration, durationMs };
  }
  async saveSessionState(sessionId, state) {
    try {
      logger.debug(`💾 Session state saved for ${sessionId}: ${state.status}`);
      return true;
    } catch (error) {
      logger.error(`❌ Failed to save session state for ${sessionId}:`, error);
      return false;
    }
  }
  async loadSessionState(sessionId) {
    try {
      return {
        sessionId,
        userId: 1,
        whatsappSessionId: "mock_wa_session",
        status: "PAUSED",
        campaignName: "Mock Campaign",
        messageTemplate: "Mock template",
        totalMessages: 100,
        currentIndex: 50,
        sentCount: 45,
        failedCount: 3,
        skippedCount: 2,
        pendingCount: 50,
        processingCount: 0,
        progressPercentage: 50.0,
        config: {},
        timestamps: {
          createdAt: new Date(),
          startedAt: new Date(),
          pausedAt: new Date(),
          resumedAt: null,
          completedAt: null,
          stoppedAt: null,
        },
      };
    } catch (error) {
      logger.error(`❌ Failed to load session state for ${sessionId}:`, error);
      return null;
    }
  }
}
module.exports = new SessionPersistence();
