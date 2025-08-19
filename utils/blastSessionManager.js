const logger = require("./logger");
const BlastSession = require("../models/blastSessionModel");
const BlastMessage = require("../models/blastMessageModel");
const SpinTextEngine = require("./spinTextEngine");

/**
 * BlastSessionManager - Core class untuk mengelola blast sessions
 * Handles create, pause, resume, stop, dan recovery functionality
 */
class BlastSessionManager {
  constructor() {
    this.activeSessions = new Map(); // In-memory session tracking
  }

  /**
   * Create new blast session
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
      // Create session record
      const session = await BlastSession.create({
        sessionId,
        userId,
        whatsappSessionId,
        campaignName,
        messageTemplate,
        totalMessages: messageList.length,
        status: "IDLE",
        config: {
          ...this.getDefaultConfig(),
          ...config,
        },
      });

      // Create message records
      const messages = messageList.map((msg, index) => ({
        sessionId,
        messageIndex: index,
        phone: msg.phone,
        contactName: msg.contactName || msg.name,
        messageTemplate: msg.messageTemplate || messageTemplate,
        variables: msg.variables || {},
        status: "pending",
      }));

      await BlastMessage.bulkCreate(messages);

      logger.info(
        `✅ Blast session created: ${sessionId} with ${messageList.length} messages`
      );

      return {
        success: true,
        sessionId,
        session: session.toJSON(),
        totalMessages: messageList.length,
      };
    } catch (error) {
      logger.error(`❌ Failed to create blast session:`, error);
      throw new Error(`Failed to create blast session: ${error.message}`);
    }
  }

  /**
   * Start blast session
   * @param {string} sessionId - Session ID
   * @returns {Object} - Start result
   */
  async startSession(sessionId) {
    try {
      const session = await BlastSession.findOne({ where: { sessionId } });

      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      if (session.status !== "IDLE" && session.status !== "PAUSED") {
        throw new Error(`Cannot start session in ${session.status} state`);
      }

      // Update session status
      await session.update({
        status: "RUNNING",
        startedAt: session.startedAt || new Date(),
        resumedAt: session.status === "PAUSED" ? new Date() : null,
      });

      // Add to active sessions tracking
      this.activeSessions.set(sessionId, {
        sessionId,
        status: "RUNNING",
        startedAt: new Date(),
        userId: session.userId,
      });

      // Start execution service
      const blastExecutionService = require("../services/blastExecutionService");
      await blastExecutionService.startExecution(sessionId);

      logger.info(`🚀 Blast session started: ${sessionId}`);

      return {
        success: true,
        sessionId,
        status: "RUNNING",
        message: "Session started successfully",
      };
    } catch (error) {
      logger.error(`❌ Failed to start session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Pause blast session
   * @param {string} sessionId - Session ID
   * @returns {Object} - Pause result
   */
  async pauseSession(sessionId) {
    try {
      const session = await BlastSession.findOne({ where: { sessionId } });

      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      if (session.status !== "RUNNING") {
        throw new Error(`Cannot pause session in ${session.status} state`);
      }

      // Pause execution service first
      const blastExecutionService = require("../services/blastExecutionService");
      await blastExecutionService.pauseExecution(sessionId);

      // Update session status
      await session.update({
        status: "PAUSED",
        pausedAt: new Date(),
      });

      // Update active sessions tracking
      if (this.activeSessions.has(sessionId)) {
        const activeSession = this.activeSessions.get(sessionId);
        activeSession.status = "PAUSED";
        activeSession.pausedAt = new Date();
      }

      logger.info(`⏸️ Blast session paused: ${sessionId}`);

      return {
        success: true,
        sessionId,
        status: "PAUSED",
        message: "Session paused successfully",
      };
    } catch (error) {
      logger.error(`❌ Failed to pause session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Resume blast session
   * @param {string} sessionId - Session ID
   * @returns {Object} - Resume result
   */
  async resumeSession(sessionId) {
    try {
      const session = await BlastSession.findOne({ where: { sessionId } });

      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      if (session.status !== "PAUSED") {
        throw new Error(`Cannot resume session in ${session.status} state`);
      }

      // Resume execution service first
      const blastExecutionService = require("../services/blastExecutionService");
      await blastExecutionService.resumeExecution(sessionId);

      // Update session status
      await session.update({
        status: "RUNNING",
        resumedAt: new Date(),
      });

      // Update active sessions tracking
      if (this.activeSessions.has(sessionId)) {
        const activeSession = this.activeSessions.get(sessionId);
        activeSession.status = "RUNNING";
        activeSession.resumedAt = new Date();
      } else {
        // Re-add to active sessions if not present
        this.activeSessions.set(sessionId, {
          sessionId,
          status: "RUNNING",
          resumedAt: new Date(),
          userId: session.userId,
        });
      }

      logger.info(`▶️ Blast session resumed: ${sessionId}`);

      return {
        success: true,
        sessionId,
        status: "RUNNING",
        message: "Session resumed successfully",
      };
    } catch (error) {
      logger.error(`❌ Failed to resume session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Stop blast session
   * @param {string} sessionId - Session ID
   * @returns {Object} - Stop result
   */
  async stopSession(sessionId) {
    try {
      const session = await BlastSession.findOne({ where: { sessionId } });

      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      if (!["RUNNING", "PAUSED"].includes(session.status)) {
        throw new Error(`Cannot stop session in ${session.status} state`);
      }

      // Stop execution service first
      const blastExecutionService = require("../services/blastExecutionService");
      await blastExecutionService.stopExecution(sessionId);

      // Update session status
      await session.update({
        status: "STOPPED",
        stoppedAt: new Date(),
      });

      // Remove from active sessions tracking
      this.activeSessions.delete(sessionId);

      // Mark all pending messages as skipped
      await BlastMessage.update(
        {
          status: "skipped",
          errorMessage: "Session stopped by user",
        },
        {
          where: {
            sessionId,
            status: ["pending", "processing"],
          },
        }
      );

      logger.info(`⏹️ Blast session stopped: ${sessionId}`);

      return {
        success: true,
        sessionId,
        status: "STOPPED",
        message: "Session stopped successfully",
      };
    } catch (error) {
      logger.error(`❌ Failed to stop session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Get session status and progress
   * @param {string} sessionId - Session ID
   * @returns {Object} - Session status
   */
  async getSessionStatus(sessionId) {
    try {
      const session = await BlastSession.findBySessionId(sessionId);

      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      // Get message statistics
      const stats = await BlastMessage.getSessionStats(sessionId);
      const statsMap = stats.reduce((acc, stat) => {
        acc[stat.status] = parseInt(stat.count);
        return acc;
      }, {});

      // Calculate progress
      const completed =
        (statsMap.sent || 0) + (statsMap.failed || 0) + (statsMap.skipped || 0);
      const progressPercentage =
        session.totalMessages > 0
          ? ((completed / session.totalMessages) * 100).toFixed(2)
          : 0;

      // Get next message to process
      const nextMessage = await BlastMessage.findNextToProcess(
        sessionId,
        session.currentIndex
      );

      return {
        success: true,
        sessionId,
        status: session.status,
        progress: {
          total: session.totalMessages,
          completed,
          pending: statsMap.pending || 0,
          processing: statsMap.processing || 0,
          sent: statsMap.sent || 0,
          failed: statsMap.failed || 0,
          skipped: statsMap.skipped || 0,
          percentage: parseFloat(progressPercentage),
          currentIndex: session.currentIndex,
          nextMessageIndex: nextMessage?.messageIndex || null,
        },
        timestamps: {
          createdAt: session.createdAt,
          startedAt: session.startedAt,
          pausedAt: session.pausedAt,
          resumedAt: session.resumedAt,
          completedAt: session.completedAt,
          stoppedAt: session.stoppedAt,
        },
        config: session.config,
        isActive: this.activeSessions.has(sessionId),
      };
    } catch (error) {
      logger.error(`❌ Failed to get session status ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Get next messages to process
   * @param {string} sessionId - Session ID
   * @param {number} limit - Limit number of messages
   * @returns {Array} - Next messages to process
   */
  async getNextMessages(sessionId, limit = 10) {
    try {
      // Get pending messages first
      let messages = await BlastMessage.findPendingBySession(sessionId, limit);

      // If not enough pending messages, get retryable failed messages
      if (messages.length < limit) {
        const retryableMessages = await BlastMessage.findRetryableBySession(
          sessionId,
          limit - messages.length
        );
        messages = [...messages, ...retryableMessages];
      }

      return messages;
    } catch (error) {
      logger.error(`❌ Failed to get next messages for ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Update session progress
   * @param {string} sessionId - Session ID
   * @param {number} currentIndex - Current processing index
   * @returns {Object} - Update result
   */
  async updateProgress(sessionId, currentIndex) {
    try {
      const session = await BlastSession.findBySessionId(sessionId);

      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      await session.update({ currentIndex });
      await session.updateProgress();

      return {
        success: true,
        currentIndex,
        progressPercentage: session.progressPercentage,
      };
    } catch (error) {
      logger.error(`❌ Failed to update progress for ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Mark session as completed
   * @param {string} sessionId - Session ID
   * @returns {Object} - Completion result
   */
  async completeSession(sessionId) {
    try {
      const session = await BlastSession.findBySessionId(sessionId);

      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      await session.update({
        status: "COMPLETED",
        completedAt: new Date(),
      });

      // Remove from active sessions
      this.activeSessions.delete(sessionId);

      logger.info(`✅ Blast session completed: ${sessionId}`);

      return {
        success: true,
        sessionId,
        status: "COMPLETED",
        message: "Session completed successfully",
      };
    } catch (error) {
      logger.error(`❌ Failed to complete session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Recover active sessions on server restart
   * @param {number} userId - User ID (optional, for specific user)
   * @returns {Array} - Recovered sessions
   */
  async recoverActiveSessions(userId = null) {
    try {
      const whereClause = {
        status: ["RUNNING", "PAUSED"],
      };

      if (userId) {
        whereClause.userId = userId;
      }

      const activeSessions = await BlastSession.findAll({
        where: whereClause,
        include: [
          {
            model: require("./userModel"),
            as: "user",
            attributes: ["id", "username"],
          },
        ],
      });

      // Restore to in-memory tracking
      for (const session of activeSessions) {
        this.activeSessions.set(session.sessionId, {
          sessionId: session.sessionId,
          status: session.status,
          userId: session.userId,
          recoveredAt: new Date(),
        });
      }

      logger.info(
        `🔄 Recovered ${activeSessions.length} active blast sessions`
      );

      return activeSessions.map((session) => ({
        sessionId: session.sessionId,
        status: session.status,
        userId: session.userId,
        campaignName: session.campaignName,
        totalMessages: session.totalMessages,
        progressPercentage: session.progressPercentage,
      }));
    } catch (error) {
      logger.error(`❌ Failed to recover active sessions:`, error);
      throw error;
    }
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
}

// Export singleton instance
module.exports = new BlastSessionManager();
