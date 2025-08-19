const logger = require("./logger");
const BlastSession = require("../models/blastSessionModel");
const BlastMessage = require("../models/blastMessageModel");
const blastSessionManager = require("./blastSessionManager");

/**
 * SessionPersistence - Handles session persistence and recovery
 * Manages database operations for session state management
 */
class SessionPersistence {
  constructor() {
    this.recoveryInProgress = false;
  }

  /**
   * Save session state to database
   * @param {string} sessionId - Session ID
   * @param {Object} state - Session state to save
   * @returns {boolean} - Success status
   */
  async saveSessionState(sessionId, state) {
    try {
      const session = await BlastSession.findBySessionId(sessionId);

      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      await session.update({
        status: state.status,
        currentIndex: state.currentIndex,
        sentCount: state.sentCount,
        failedCount: state.failedCount,
        skippedCount: state.skippedCount,
        progressPercentage: state.progressPercentage,
        estimatedCompletion: state.estimatedCompletion,
        config: state.config,
        ...(state.status === "PAUSED" && { pausedAt: new Date() }),
        ...(state.status === "RUNNING" && { resumedAt: new Date() }),
        ...(state.status === "STOPPED" && { stoppedAt: new Date() }),
        ...(state.status === "COMPLETED" && { completedAt: new Date() }),
        ...(state.status === "ERROR" && {
          errorMessage: state.errorMessage,
          stoppedAt: new Date(),
        }),
      });

      logger.debug(`💾 Session state saved for ${sessionId}: ${state.status}`);
      return true;
    } catch (error) {
      logger.error(`❌ Failed to save session state for ${sessionId}:`, error);
      return false;
    }
  }

  /**
   * Load session state from database
   * @param {string} sessionId - Session ID
   * @returns {Object|null} - Session state or null if not found
   */
  async loadSessionState(sessionId) {
    try {
      const session = await BlastSession.findBySessionId(sessionId);

      if (!session) {
        return null;
      }

      // Get message statistics
      const stats = await BlastMessage.getSessionStats(sessionId);
      const statsMap = stats.reduce((acc, stat) => {
        acc[stat.status] = parseInt(stat.count);
        return acc;
      }, {});

      return {
        sessionId: session.sessionId,
        userId: session.userId,
        whatsappSessionId: session.whatsappSessionId,
        status: session.status,
        campaignName: session.campaignName,
        messageTemplate: session.messageTemplate,
        totalMessages: session.totalMessages,
        currentIndex: session.currentIndex,
        sentCount: statsMap.sent || 0,
        failedCount: statsMap.failed || 0,
        skippedCount: statsMap.skipped || 0,
        pendingCount: statsMap.pending || 0,
        processingCount: statsMap.processing || 0,
        progressPercentage: parseFloat(session.progressPercentage || 0),
        estimatedCompletion: session.estimatedCompletion,
        config: session.config || {},
        timestamps: {
          createdAt: session.createdAt,
          startedAt: session.startedAt,
          pausedAt: session.pausedAt,
          resumedAt: session.resumedAt,
          completedAt: session.completedAt,
          stoppedAt: session.stoppedAt,
        },
        errorMessage: session.errorMessage,
      };
    } catch (error) {
      logger.error(`❌ Failed to load session state for ${sessionId}:`, error);
      return null;
    }
  }

  /**
   * Get all active sessions for recovery
   * @param {number} userId - User ID (optional)
   * @returns {Array} - Array of active session states
   */
  async getActiveSessions(userId = null) {
    try {
      const whereClause = {
        status: ["RUNNING", "PAUSED"],
      };

      if (userId) {
        whereClause.userId = userId;
      }

      const sessions = await BlastSession.findAll({
        where: whereClause,
        // include: [
        //   {
        //     model: require("../models/userModel"),
        //     as: "user",
        //     attributes: ["id", "username", "role"],
        //   },
        // ],
        order: [["updatedAt", "DESC"]],
      });

      const activeStates = [];

      for (const session of sessions) {
        const state = await this.loadSessionState(session.sessionId);
        if (state) {
          activeStates.push(state);
        }
      }

      return activeStates;
    } catch (error) {
      logger.error(`❌ Failed to get active sessions:`, error);
      return [];
    }
  }

  /**
   * Recover sessions after server restart
   * @param {number} userId - User ID (optional)
   * @returns {Object} - Recovery result
   */
  async recoverSessions(userId = null) {
    if (this.recoveryInProgress) {
      logger.warn(`⚠️ Session recovery already in progress`);
      return { success: false, message: "Recovery already in progress" };
    }

    this.recoveryInProgress = true;

    try {
      logger.info(
        `🔄 Starting session recovery${userId ? ` for user ${userId}` : ""}...`
      );

      const activeSessions = await this.getActiveSessions(userId);

      if (activeSessions.length === 0) {
        logger.info(`✅ No active sessions to recover`);
        return {
          success: true,
          recoveredSessions: [],
          message: "No active sessions found",
        };
      }

      const recoveredSessions = [];
      const failedRecoveries = [];

      for (const sessionState of activeSessions) {
        try {
          // Restore session to blast session manager
          blastSessionManager.activeSessions.set(sessionState.sessionId, {
            sessionId: sessionState.sessionId,
            status: sessionState.status,
            userId: sessionState.userId,
            recoveredAt: new Date(),
          });

          recoveredSessions.push({
            sessionId: sessionState.sessionId,
            status: sessionState.status,
            campaignName: sessionState.campaignName,
            totalMessages: sessionState.totalMessages,
            progressPercentage: sessionState.progressPercentage,
            userId: sessionState.userId,
          });

          logger.info(
            `✅ Recovered session: ${sessionState.sessionId} (${sessionState.status})`
          );
        } catch (sessionError) {
          logger.error(
            `❌ Failed to recover session ${sessionState.sessionId}:`,
            sessionError
          );
          failedRecoveries.push({
            sessionId: sessionState.sessionId,
            error: sessionError.message,
          });
        }
      }

      logger.info(
        `🔄 Session recovery completed: ${recoveredSessions.length} recovered, ${failedRecoveries.length} failed`
      );

      return {
        success: true,
        recoveredSessions,
        failedRecoveries,
        message: `Recovered ${recoveredSessions.length} sessions`,
      };
    } catch (error) {
      logger.error(`❌ Session recovery failed:`, error);
      return {
        success: false,
        error: error.message,
        message: "Session recovery failed",
      };
    } finally {
      this.recoveryInProgress = false;
    }
  }

  /**
   * Clean up old completed sessions
   * @param {number} daysOld - Days old to clean up (default: 30)
   * @param {number} userId - User ID (optional)
   * @returns {Object} - Cleanup result
   */
  async cleanupOldSessions(daysOld = 30, userId = null) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const whereClause = {
        status: ["COMPLETED", "STOPPED", "ERROR"],
        updatedAt: {
          [require("sequelize").Op.lt]: cutoffDate,
        },
      };

      if (userId) {
        whereClause.userId = userId;
      }

      // First, get sessions to be deleted for logging
      const sessionsToDelete = await BlastSession.findAll({
        where: whereClause,
        attributes: ["sessionId", "campaignName", "status", "updatedAt"],
      });

      // Delete messages first (due to foreign key constraint)
      let deletedMessagesCount = 0;
      for (const session of sessionsToDelete) {
        const messageCount = await BlastMessage.destroy({
          where: { sessionId: session.sessionId },
        });
        deletedMessagesCount += messageCount;
      }

      // Then delete sessions
      const deletedSessionsCount = await BlastSession.destroy({
        where: whereClause,
      });

      logger.info(
        `🗑️ Cleaned up ${deletedSessionsCount} old sessions and ${deletedMessagesCount} messages`
      );

      return {
        success: true,
        deletedSessions: deletedSessionsCount,
        deletedMessages: deletedMessagesCount,
        cutoffDate: cutoffDate.toISOString(),
      };
    } catch (error) {
      logger.error(`❌ Failed to cleanup old sessions:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get session history for user
   * @param {number} userId - User ID
   * @param {number} limit - Limit number of results (default: 50)
   * @param {number} offset - Offset for pagination (default: 0)
   * @returns {Object} - Session history
   */
  async getSessionHistory(userId, limit = 50, offset = 0) {
    try {
      const { count, rows: sessions } = await BlastSession.findAndCountAll({
        where: { userId },
        // include: [
        //   {
        //     model: require("../models/userModel"),
        //     as: "user",
        //     attributes: ["id", "username"],
        //   },
        // ],
        order: [["createdAt", "DESC"]],
        limit,
        offset,
      });

      const sessionHistory = [];

      for (const session of sessions) {
        // Get message statistics for each session
        const stats = await BlastMessage.getSessionStats(session.sessionId);
        const statsMap = stats.reduce((acc, stat) => {
          acc[stat.status] = parseInt(stat.count);
          return acc;
        }, {});

        sessionHistory.push({
          sessionId: session.sessionId,
          campaignName: session.campaignName,
          status: session.status,
          totalMessages: session.totalMessages,
          progressPercentage: parseFloat(session.progressPercentage || 0),
          messageStats: statsMap,
          timestamps: {
            createdAt: session.createdAt,
            startedAt: session.startedAt,
            completedAt: session.completedAt,
            stoppedAt: session.stoppedAt,
          },
          duration: this.calculateSessionDuration(session),
        });
      }

      return {
        success: true,
        total: count,
        sessions: sessionHistory,
        pagination: {
          limit,
          offset,
          hasMore: offset + limit < count,
        },
      };
    } catch (error) {
      logger.error(
        `❌ Failed to get session history for user ${userId}:`,
        error
      );
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Calculate session duration
   * @param {Object} session - Session object
   * @returns {Object} - Duration information
   */
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

  /**
   * Format duration in human readable format
   * @param {number} durationMs - Duration in milliseconds
   * @returns {string} - Formatted duration
   */
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

  /**
   * Validate session integrity
   * @param {string} sessionId - Session ID
   * @returns {Object} - Validation result
   */
  async validateSessionIntegrity(sessionId) {
    try {
      const session = await BlastSession.findBySessionId(sessionId);

      if (!session) {
        return {
          valid: false,
          issues: ["Session not found"],
        };
      }

      const issues = [];

      // Check message count consistency
      const messageCount = await BlastMessage.count({
        where: { sessionId },
      });

      if (messageCount !== session.totalMessages) {
        issues.push(
          `Message count mismatch: expected ${session.totalMessages}, found ${messageCount}`
        );
      }

      // Check status consistency
      const stats = await BlastMessage.getSessionStats(sessionId);
      const statsMap = stats.reduce((acc, stat) => {
        acc[stat.status] = parseInt(stat.count);
        return acc;
      }, {});

      const totalProcessed =
        (statsMap.sent || 0) + (statsMap.failed || 0) + (statsMap.skipped || 0);
      const expectedProgress =
        session.totalMessages > 0
          ? ((totalProcessed / session.totalMessages) * 100).toFixed(2)
          : 0;

      if (
        Math.abs(
          parseFloat(session.progressPercentage) - parseFloat(expectedProgress)
        ) > 0.1
      ) {
        issues.push(
          `Progress percentage mismatch: stored ${session.progressPercentage}%, calculated ${expectedProgress}%`
        );
      }

      return {
        valid: issues.length === 0,
        issues,
        stats: statsMap,
        session: {
          sessionId: session.sessionId,
          status: session.status,
          totalMessages: session.totalMessages,
          progressPercentage: session.progressPercentage,
        },
      };
    } catch (error) {
      logger.error(
        `❌ Failed to validate session integrity for ${sessionId}:`,
        error
      );
      return {
        valid: false,
        issues: [`Validation error: ${error.message}`],
      };
    }
  }
}

// Export singleton instance
module.exports = new SessionPersistence();
