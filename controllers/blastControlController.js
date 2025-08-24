const logger = require("../utils/logger");
const { getSocket } = require("../auth/socket");
const blastSessionManager = require("../utils/blastSessionManager");
const messageQueueHandler = require("../utils/messageQueueHandler");
const sessionPersistence = require("../utils/sessionPersistence");
const BlastSession = require("../models/blastSessionModel");
const BlastMessage = require("../models/blastMessageModel");
const { AppError } = require("../middleware/errorHandler");
const blastExecutionService = require("../services/blastExecutionService"); // Import blastExecutionService

const emitSessionUpdate = async () => {
  try {
    const sessions = await BlastSession.findAll({
      order: [["createdAt", "DESC"]],
    });
    getSocket().emit("sessions-update", sessions);
  } catch (error) {
    logger.error("Failed to emit session update:", error);
  }
};

/**
 * Blast Control Controller
 * Handles all blast session control operations
 */

/**
 * Create new blast session
 */
const createBlastSession = async (req, res) => {
  const {
    whatsappSessionId,
    campaignName,
    messageTemplate,
    messageList,
    config = {},
  } = req.body;

  // Validation
  if (
    !whatsappSessionId ||
    !messageTemplate ||
    !messageList ||
    !Array.isArray(messageList)
  ) {
    throw new AppError(
      "Missing required fields: whatsappSessionId, messageTemplate, messageList",
      400
    );
  }

  if (messageList.length === 0) {
    throw new AppError("Message list cannot be empty", 400);
  }

  try {
    // Create blast session
    const result = await blastSessionManager.createSession({
      userId: req.user.id,
      whatsappSessionId,
      campaignName: campaignName || `Campaign ${Date.now()}`,
      messageTemplate,
      messageList,
      config,
    });

    logger.info(
      `✅ Blast session created by user ${req.user.id}: ${result.sessionId}`
    );

    res.status(201).json({
      success: true,
      message: "Blast session created successfully",
      data: {
        sessionId: result.sessionId,
        totalMessages: result.totalMessages,
        status: "IDLE",
      },
    });
  } catch (error) {
    logger.error(
      `❌ Failed to create blast session for user ${req.user.id}:`,
      error
    );
    throw new AppError(`Failed to create blast session: ${error.message}`, 500);
  }
};

/**
 * Start blast session
 */
const startBlastSession = async (req, res) => {
  const { sessionId } = req.params;

  try {
    // Verify session ownership
    const session = await BlastSession.findOne({
      where: { sessionId, userId: req.user.id },
    });

    if (!session) {
      throw new AppError("Blast session not found or access denied", 404);
    }

    // Check if business hours are enabled and if current time is outside business hours
    const businessHoursConfig = session.config?.businessHours;
    logger.info(`[startBlastSession] Session ${sessionId} businessHoursConfig: ${JSON.stringify(businessHoursConfig)}`);
    const isWithinHours = blastExecutionService.isWithinBusinessHours(businessHoursConfig);
    logger.info(`[startBlastSession] Session ${sessionId} isWithinBusinessHours: ${isWithinHours}`);

    let isPausedDueToBusinessHours = false; // Initialize flag

    if (
      businessHoursConfig &&
      businessHoursConfig.enabled &&
      !blastExecutionService.isWithinBusinessHours(businessHoursConfig)
    ) {
      logger.info(`Attempting to emit notification for session ${sessionId} due to business hours.`);
      getSocket().emit("notification", {
        type: "warning",
        message: `Blast session ${sessionId} will be paused until business hours (${businessHoursConfig.startHour}:00 - ${businessHoursConfig.endHour}:00).`,
      });
      logger.info(
        `⏰ Notification emitted for session ${sessionId}: Blast session will be paused due to business hours.`
      );
      isPausedDueToBusinessHours = true; // Set flag if condition met
    }

    // Start session
    const result = await blastSessionManager.startSession(sessionId);

    logger.info(
      `▶️ Blast session started by user ${req.user.id}: ${sessionId}`
    );

    res.json({
      success: true,
      message: "Blast session started successfully",
      data: {
        ...result, // Include existing result data
        isPausedDueToBusinessHours: isPausedDueToBusinessHours, // Add the new flag
      },
    });
  } catch (error) {
    logger.error(`❌ Failed to start blast session ${sessionId}:`, error);
    throw new AppError(`Failed to start blast session: ${error.message}`, 500);
  }
};

/**
 * Pause blast session
 */
const pauseBlastSession = async (req, res) => {
  const { sessionId } = req.params;

  try {
    // Verify session ownership
    const session = await BlastSession.findOne({
      where: { sessionId, userId: req.user.id },
    });

    if (!session) {
      throw new AppError("Blast session not found or access denied", 404);
    }

    // Pause session
    const result = await blastSessionManager.pauseSession(sessionId);

    logger.info(`⏸️ Blast session paused by user ${req.user.id}: ${sessionId}`);

    res.json({
      success: true,
      message: "Blast session paused successfully",
      data: result,
    });
  } catch (error) {
    logger.error(`❌ Failed to pause blast session ${sessionId}:`, error);
    throw new AppError(`Failed to pause blast session: ${error.message}`, 500);
  }
};

/**
 * Resume blast session
 */
const resumeBlastSession = async (req, res) => {
  const { sessionId } = req.params;

  try {
    // Verify session ownership
    const session = await BlastSession.findOne({
      where: { sessionId, userId: req.user.id },
    });

    if (!session) {
      throw new AppError("Blast session not found or access denied", 404);
    }

    // Resume session
    const result = await blastSessionManager.resumeSession(sessionId);

    logger.info(
      `▶️ Blast session resumed by user ${req.user.id}: ${sessionId}`
    );

    res.json({
      success: true,
      message: "Blast session resumed successfully",
      data: result,
    });
  } catch (error) {
    logger.error(`❌ Failed to resume blast session ${sessionId}:`, error);
    throw new AppError(`Failed to resume blast session: ${error.message}`, 500);
  }
};

/**
 * Stop blast session
 */
const stopBlastSession = async (req, res) => {
  const { sessionId } = req.params;

  try {
    // Verify session ownership
    const session = await BlastSession.findOne({
      where: { sessionId, userId: req.user.id },
    });

    if (!session) {
      throw new AppError("Blast session not found or access denied", 404);
    }

    // Stop session
    const result = await blastSessionManager.stopSession(sessionId);

    logger.info(
      `⏹️ Blast session stopped by user ${req.user.id}: ${sessionId}`
    );

    res.json({
      success: true,
      message: "Blast session stopped successfully",
      data: result,
    });
  } catch (error) {
    logger.error(`❌ Failed to stop blast session ${sessionId}:`, error);
    throw new AppError(`Failed to stop blast session: ${error.message}`, 500);
  }
};

/**
 * Get blast session status
 */
const getBlastStatus = async (req, res) => {
  const { sessionId } = req.params;

  try {
    // Verify session ownership
    const session = await BlastSession.findOne({
      where: { sessionId, userId: req.user.id },
    });

    if (!session) {
      throw new AppError("Blast session not found or access denied", 404);
    }

    // Get status
    const status = await blastSessionManager.getSessionStatus(sessionId);

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    logger.error(`❌ Failed to get blast status ${sessionId}:`, error);
    throw new AppError(`Failed to get blast status: ${error.message}`, 500);
  }
};

/**
 * Get blast session progress
 */
const getBlastProgress = async (req, res) => {
  const { sessionId } = req.params;

  try {
    // Verify session ownership
    const session = await BlastSession.findOne({
      where: { sessionId, userId: req.user.id },
    });

    if (!session) {
      throw new AppError("Blast session not found or access denied", 404);
    }

    // Get progress
    const status = await blastSessionManager.getSessionStatus(sessionId);

    res.json({
      success: true,
      data: {
        sessionId,
        progress: status.progress,
        status: status.status,
        timestamps: status.timestamps,
      },
    });
  } catch (error) {
    logger.error(`❌ Failed to get blast progress ${sessionId}:`, error);
    throw new AppError(`Failed to get blast progress: ${error.message}`, 500);
  }
};

/**
 * Get user's blast sessions
 */
const getUserBlastSessions = async (req, res) => {
  const { status, limit = 50, offset = 0 } = req.query;

  try {
    const whereClause = { userId: req.user.id };

    if (status) {
      whereClause.status = status;
    }

    const { count, rows: sessions } = await BlastSession.findAndCountAll({
      where: whereClause,
      order: [["createdAt", "DESC"]],
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    res.json({
      success: true,
      data: {
        sessions,
        pagination: {
          total: count,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: parseInt(offset) + parseInt(limit) < count,
        },
      },
    });
  } catch (error) {
    logger.error(
      `❌ Failed to get user blast sessions for user ${req.user.id}:`,
      error
    );
    throw new AppError(`Failed to get blast sessions: ${error.message}`, 500);
  }
};

/**
 * Get session messages
 */
const getSessionMessages = async (req, res) => {
  const { sessionId } = req.params;
  const { status, limit = 100, offset = 0 } = req.query;

  try {
    // Verify session ownership
    const session = await BlastSession.findOne({
      where: { sessionId, userId: req.user.id },
    });

    if (!session) {
      throw new AppError("Blast session not found or access denied", 404);
    }

    const whereClause = { sessionId };

    if (status) {
      whereClause.status = status;
    }

    const { count, rows: messages } = await BlastMessage.findAndCountAll({
      where: whereClause,
      order: [["messageIndex", "ASC"]],
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    res.json({
      success: true,
      data: {
        messages,
        pagination: {
          total: count,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: parseInt(offset) + parseInt(limit) < count,
        },
      },
    });
  } catch (error) {
    logger.error(`❌ Failed to get session messages ${sessionId}:`, error);
    throw new AppError(`Failed to get session messages: ${error.message}`, 500);
  }
};

/**
 * Retry failed messages
 */
const retryFailedMessages = async (req, res) => {
  const { sessionId } = req.params;

  try {
    // Verify session ownership
    const session = await BlastSession.findOne({
      where: { sessionId, userId: req.user.id },
    });

    if (!session) {
      throw new AppError("Blast session not found or access denied", 404);
    }

    // Reset failed messages for retry
    const resetCount = await messageQueueHandler.resetFailedMessages(sessionId);

    logger.info(
      `🔄 Reset ${resetCount} failed messages for retry in session ${sessionId}`
    );

    res.json({
      success: true,
      message: `${resetCount} failed messages reset for retry`,
      data: { resetCount },
    });
  } catch (error) {
    logger.error(`❌ Failed to retry failed messages ${sessionId}:`, error);
    throw new AppError(
      `Failed to retry failed messages: ${error.message}`,
      500
    );
  }
};

/**
 * Recover active sessions
 */
const recoverActiveSessions = async (req, res) => {
  try {
    const result = await sessionPersistence.recoverSessions(req.user.id);

    logger.info(
      `🔄 Recovered sessions for user ${req.user.id}: ${result.recoveredSessions.length}`
    );

    res.json({
      success: true,
      message: `Recovered ${result.recoveredSessions.length} active sessions`,
      data: result,
    });
  } catch (error) {
    logger.error(
      `❌ Failed to recover sessions for user ${req.user.id}:`,
      error
    );
    throw new AppError(`Failed to recover sessions: ${error.message}`, 500);
  }
};

/**
 * Cleanup session
 */
const cleanupSession = async (req, res) => {
  const { sessionId } = req.params;

  try {
    // Verify session ownership
    const session = await BlastSession.findOne({
      where: { sessionId, userId: req.user.id },
    });

    if (!session) {
      throw new AppError("Blast session not found or access denied", 404);
    }

    // Only allow cleanup of completed/stopped sessions
    if (!["COMPLETED", "STOPPED", "ERROR"].includes(session.status)) {
      throw new AppError(
        "Can only cleanup completed, stopped, or error sessions",
        400
      );
    }

    // Delete messages first
    const deletedMessages = await BlastMessage.destroy({
      where: { sessionId },
    });

    // Delete session
    await BlastSession.destroy({
      where: { sessionId },
    });

    logger.info(
      `🗑️ Cleaned up session ${sessionId}: ${deletedMessages} messages deleted`
    );

    res.json({
      success: true,
      message: "Session cleaned up successfully",
      data: { deletedMessages },
    });
  } catch (error) {
    logger.error(`❌ Failed to cleanup session ${sessionId}:`, error);
    throw new AppError(`Failed to cleanup session: ${error.message}`, 500);
  }
};

/**
 * Get system health
 */
const getSystemHealth = async (req, res) => {
  try {
    const activeSessions = blastSessionManager.getActiveSessions();

    const totalSessions = await BlastSession.count();
    const activeDatabaseSessions = await BlastSession.count({
      where: { status: ["RUNNING", "PAUSED"] },
    });

    const health = {
      status: "healthy",
      activeSessions: activeSessions.length,
      totalSessions,
      activeDatabaseSessions,
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime(),
    };

    res.json({
      success: true,
      data: health,
    });
  } catch (error) {
    logger.error("❌ Failed to get system health:", error);
    throw new AppError(`Failed to get system health: ${error.message}`, 500);
  }
};

/**
 * Get session statistics
 */
const getSessionStats = async (req, res) => {
  const { sessionId } = req.params;

  try {
    // Verify session ownership
    const session = await BlastSession.findOne({
      where: { sessionId, userId: req.user.id },
    });

    if (!session) {
      throw new AppError("Blast session not found or access denied", 404);
    }

    // Get queue statistics
    const stats = await messageQueueHandler.getQueueStats(sessionId);

    res.json({
      success: true,
      data: {
        sessionId,
        ...stats,
        session: {
          status: session.status,
          campaignName: session.campaignName,
          createdAt: session.createdAt,
          startedAt: session.startedAt,
          completedAt: session.completedAt,
        },
      },
    });
  } catch (error) {
    logger.error(`❌ Failed to get session stats ${sessionId}:`, error);
    throw new AppError(`Failed to get session stats: ${error.message}`, 500);
  }
};

const handleSessionAction = async (req, res) => {
  const { sessionId } = req.params;
  const { action } = req.body;

  switch (action) {
    case "start":
      return startBlastSession(req, res);
    case "pause":
      return pauseBlastSession(req, res);
    case "resume":
      return resumeBlastSession(req, res);
    case "stop":
      return stopBlastSession(req, res);
    default:
      throw new AppError(`Invalid action: ${action}`, 400);
  }
};

module.exports = {
  createBlastSession,
  startBlastSession,
  pauseBlastSession,
  resumeBlastSession,
  stopBlastSession,
  getBlastStatus,
  getBlastProgress,
  getUserBlastSessions,
  getSessionMessages,
  retryFailedMessages,
  recoverActiveSessions,
  cleanupSession,
  getSystemHealth,
  getSessionStats,
  handleSessionAction,
};
