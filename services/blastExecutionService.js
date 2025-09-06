const logger = require("../utils/logger");
const { getSocket } = require("../auth/socket");
const { getSock } = require("../auth/session");
const blastSessionManager = require("../utils/blastSessionManager");
const messageQueueHandler = require("../utils/messageQueueHandler");
const BlastSession = require("../models/blastSessionModel");
const BlastMessage = require("../models/blastMessageModel");
const SpinTextEngine = require("../utils/spinTextEngine");

const _emitSessionsUpdate = async (sessionId = null) => {
  try {
    const socket = getSocket();
    if (!socket) {
      logger.warn("⚠️ Socket not available for sessions update");
      return;
    }

    if (sessionId) {
      // Get userId from sessionId and emit to specific user only
      const session = await BlastSession.findOne({
        where: { sessionId },
        attributes: ['userId']
      });
      
      if (session) {
        const userSessions = await BlastSession.findAll({
          where: { userId: session.userId },
          order: [["createdAt", "DESC"]],
        });
        socket.to(`user_${session.userId}`).emit("sessions-update", userSessions);
        logger.debug(`📡 Emitted sessions update to user ${session.userId}: ${userSessions.length} sessions`);
      }
    } else {
      // Emit to all users with their respective sessions
      const allUsers = await BlastSession.findAll({
        attributes: ['userId'],
        group: ['userId'],
        raw: true
      });
      
      for (const userObj of allUsers) {
        const userSessions = await BlastSession.findAll({
          where: { userId: userObj.userId },
          order: [["createdAt", "DESC"]],
        });
        socket.to(`user_${userObj.userId}`).emit("sessions-update", userSessions);
      }
      logger.debug(`📡 Emitted sessions update to all users: ${allUsers.length} users`);
    }
  } catch (error) {
    logger.error("❌ Failed to emit session update:", error);
  }
};

/**
 * Emit toast notification to frontend
 * @param {string} type - Toast type: 'success', 'error', 'warning', 'info'
 * @param {string} title - Toast title
 * @param {string} description - Toast description
 * @param {string} sessionId - Session ID (optional)
 */
const _emitToastNotification = (type, title, description, sessionId = null) => {
  try {
    const socket = getSocket();
    if (socket) {
      socket.emit("toast-notification", {
        type,
        title,
        description,
        sessionId,
        timestamp: new Date().toISOString(),
      });
      logger.debug(`🍞 Emitted toast: ${type} - ${title}`);
    } else {
      logger.warn("⚠️ Socket not available for toast notification");
    }
  } catch (error) {
    logger.error("❌ Failed to emit toast notification:", error);
  }
};

/**
 * Blast Execution Service
 * Handles the actual execution of blast sessions with pause/resume/stop support
 */
class BlastExecutionService {
  constructor() {
    this.runningExecutions = new Map(); // sessionId -> execution state
    this.businessHoursTimers = new Map(); // sessionId -> timer for auto-resume

    // Start auto-resume scheduler for existing paused sessions
    this.initializeAutoResumeScheduler();
  }

  /**
   * Start executing a blast session
   * @param {string} sessionId - Session ID to execute
   * @param {boolean} forceStart - Force start ignoring business hours and current status
   * @returns {Promise<Object>} - Execution result
   */
  async startExecution(sessionId, forceStart = false) {
    try {
      logger.info(
        `🚀 Starting blast execution for session: ${sessionId}${
          forceStart ? " (FORCED)" : ""
        }`
      );

      // Get session details
      const session = await BlastSession.findOne({ where: { sessionId } });
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      // Check business hours first (unless forced)
      if (!forceStart) {
        const businessHoursConfig = session.config?.businessHours || {};
        if (
          businessHoursConfig.enabled &&
          !this.isWithinBusinessHours(businessHoursConfig)
        ) {
          // Instead of throwing error, update session to PAUSED and schedule for later
          await session.update({
            status: "PAUSED",
            pausedAt: new Date(),
          });

          // PERBAIKAN: Schedule auto-resume saat campaign di-pause
          this.scheduleBusinessHoursCheck(sessionId, businessHoursConfig);

          const nextStart = this.getNextBusinessHoursStart(businessHoursConfig);
          const timeUntilNext = nextStart.getTime() - Date.now();
          const minutesUntilNext = Math.round(timeUntilNext / (1000 * 60));

          logger.info(
            `⏰ Session ${sessionId} scheduled for ${nextStart.toLocaleString()} (in ${minutesUntilNext} minutes)`
          );

          // Emit UI update for paused status
          _emitSessionsUpdate(sessionId);

          // Emit toast notification for auto-scheduling
          _emitToastNotification(
            "info",
            "Campaign Dijadwalkan",
            `Campaign akan otomatis dimulai pada ${nextStart.toLocaleString()} (${minutesUntilNext} menit lagi)`,
            sessionId
          );

          return {
            success: true,
            sessionId,
            message: `Campaign dijadwalkan otomatis resume pada ${nextStart.toLocaleString()} (${minutesUntilNext} menit lagi)`,
            scheduledFor: nextStart,
            minutesUntilResume: minutesUntilNext,
          };
        }
      }

      // Check if already running in-memory. If so, and DB status allows, clear stale state.
      if (this.runningExecutions.has(sessionId)) {
        const existingState = this.runningExecutions.get(sessionId);
        if (
          session.status === "IDLE" ||
          session.status === "PAUSED" ||
          forceStart
        ) {
          logger.warn(
            `⚠️ Stale execution state found for session ${sessionId}. Clearing and restarting.`
          );
          if (existingState.updateInterval) {
            clearInterval(existingState.updateInterval);
          }
          this.runningExecutions.delete(sessionId);
        } else {
          throw new Error(`Session ${sessionId} is already running`);
        }
      }

      // Get WhatsApp socket
      const sock = getSock(session.whatsappSessionId);
      if (!sock) {
        throw new Error(
          `WhatsApp session ${session.whatsappSessionId} not found or not active`
        );
      }

      // Update database status to RUNNING first
      await session.update({
        status: "RUNNING",
        startedAt: new Date(),
      });

      // Start execution
      const executionState = {
        sessionId,
        status: "RUNNING",
        startedAt: new Date(),
        isPaused: false,
        isStopped: false,
        currentIndex: session.currentIndex || 0,
        processedCount: 0,
        successCount: 0,
        failedCount: 0,
      };

      this.runningExecutions.set(sessionId, executionState);

      // Start periodic updates via socket
      const updateInterval = setInterval(() => _emitSessionsUpdate(sessionId), 2000); // Update every 2 seconds

      executionState.updateInterval = updateInterval;

      // Emit immediate UI update for running status
      _emitSessionsUpdate(sessionId);

      // Emit toast notification for campaign start
      _emitToastNotification(
        "success",
        "Campaign Dimulai",
        `Campaign ${session.campaignName || sessionId} telah dimulai`,
        sessionId
      );

      // Start processing messages
      this.processMessages(sessionId, sock);

      return {
        success: true,
        sessionId,
        message: "Blast execution started",
      };
    } catch (error) {
      logger.error(`❌ Failed to start execution for ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Process messages for a session
   * @param {string} sessionId - Session ID
   * @param {Object} sock - WhatsApp socket
   */
  async processMessages(sessionId, sock) {
    const executionState = this.runningExecutions.get(sessionId);
    if (!executionState) {
      logger.warn(`⚠️ Execution state not found for session ${sessionId}`);
      return;
    }

    try {
      const session = await BlastSession.findOne({ where: { sessionId } });
      const businessHoursConfig = session.config?.businessHours || {};

      while (!executionState.isStopped) {
        // Check if paused
        if (executionState.isPaused) {
          logger.info(`⏸️ Session ${sessionId} is paused, waiting...`);
          await this.sleep(5000); // Check every 5 seconds
          continue;
        }

        // Check business hours
        if (
          businessHoursConfig.enabled &&
          !this.isWithinBusinessHours(businessHoursConfig)
        ) {
          if (!executionState.isPaused) {
            logger.info(
              `⏰ Session ${sessionId} is outside business hours. Auto-pausing.`
            );
            executionState.isPaused = true;

            // Update database status
            await BlastSession.update(
              { status: "PAUSED", pausedAt: new Date() },
              { where: { sessionId } }
            );

            // Schedule auto-resume check
            this.scheduleBusinessHoursCheck(sessionId, businessHoursConfig);

            // Emit UI update for auto-pause
            _emitSessionsUpdate(sessionId);

            // Emit toast notification for auto-pause
            _emitToastNotification(
              "warning",
              "Campaign Auto-Pause",
              `Campaign ${sessionId} dijeda otomatis karena di luar jam kerja`,
              sessionId
            );
          }

          // Sleep for 1 minute and check again
          await this.sleep(60 * 1000);
          continue;
        } else if (
          businessHoursConfig.enabled &&
          executionState.isPaused &&
          this.isWithinBusinessHours(businessHoursConfig)
        ) {
          // Auto-resume when back in business hours
          logger.info(
            `✅ Session ${sessionId} is now within business hours. Auto-resuming.`
          );
          executionState.isPaused = false;

          // Update database status
          await BlastSession.update(
            { status: "RUNNING", resumedAt: new Date() },
            { where: { sessionId } }
          );

          // Emit UI update for auto-resume
          _emitSessionsUpdate(sessionId);

          // Emit toast notification for auto-resume
          _emitToastNotification(
            "success",
            "Campaign Auto-Resume",
            `Campaign ${sessionId} dilanjutkan otomatis karena sudah masuk jam kerja`,
            sessionId
          );
        }

        // Get next batch of messages
        const messages = await messageQueueHandler.getNextBatch(sessionId, 1);

        if (messages.length === 0) {
          // Check if there are any remaining messages (pending or processing)
          const queueStats = await messageQueueHandler.getQueueStats(sessionId);

          if (queueStats.remaining > 0) {
            logger.info(
              `⏳ Session ${sessionId} has ${queueStats.remaining} remaining messages (${queueStats.pending} pending, ${queueStats.processing} processing). Waiting...`
            );

            // Wait a bit and continue checking
            await this.sleep(5000);
            continue;
          }

          // No more messages to process and no remaining messages
          logger.info(
            `✅ All messages processed for session ${sessionId}. Final stats: ${queueStats.sent} sent, ${queueStats.failed} failed, ${queueStats.skipped} skipped`
          );
          await this.completeExecution(sessionId);
          break;
        }

        const message = messages[0];

        try {
          // 📱 DEFENSIVE VALIDATION: Double-check phone number before sending
          logger.info(`🔍 Double-checking phone number availability: ${message.phone}`);
          
          try {
            const phoneCheck = await sock.onWhatsApp(message.phone);
            if (!phoneCheck || !phoneCheck[0]?.exists) {
              logger.warn(`❌ Phone ${message.phone} is not available on WhatsApp - marking as failed`);
              await messageQueueHandler.markAsFailed(message.id, "Phone number not available on WhatsApp");
              executionState.failedCount++;
              executionState.processedCount++;
              continue;
            }
            logger.info(`✅ Phone ${message.phone} confirmed available on WhatsApp`);
          } catch (phoneCheckError) {
            logger.warn(`⚠️ Phone validation error for ${message.phone}:`, phoneCheckError.message);
            // Continue with sending if validation fails due to technical error
          }

          // Mark as processing
          await messageQueueHandler.markAsProcessing(message.id);

          // Apply range management delays
          await this.applyRangeDelays(sessionId, executionState);

          // Send message
          const result = await this.sendMessage(sock, message);

          if (result.success) {
            // Mark as sent
            await messageQueueHandler.markAsSent(message.id, result.messageId);
            executionState.successCount++;
            logger.info(`✅ Message sent successfully: ${message.phone}`);
          } else {
            // Mark as failed
            await messageQueueHandler.markAsFailed(message.id, result.error);
            executionState.failedCount++;
            logger.warn(
              `⚠️ Message failed: ${message.phone} - ${result.error}`
            );
          }

          executionState.processedCount++;
          executionState.currentIndex = message.messageIndex;

          // Update session progress
          await this.updateSessionProgress(sessionId, executionState);

          // Emit UI update every 5 messages or every 10 seconds
          if (
            executionState.processedCount % 5 === 0 ||
            Date.now() - (executionState.lastUIUpdate || 0) > 10000
          ) {
            executionState.lastUIUpdate = Date.now();
            _emitSessionsUpdate(sessionId);
          }
        } catch (messageError) {
          logger.error(
            `❌ Error processing message ${message.id}:`,
            messageError
          );
          await messageQueueHandler.markAsFailed(
            message.id,
            messageError.message
          );
          executionState.failedCount++;
        }

        // Check if stopped during processing
        if (executionState.isStopped) {
          logger.info(`⏹️ Session ${sessionId} stopped during processing`);
          break;
        }
      }
    } catch (error) {
      logger.error(`❌ Error in message processing for ${sessionId}:`, error);
      await this.handleExecutionError(sessionId, error);
    }
  }

  /**
   * Send a single message
   * @param {Object} sock - WhatsApp socket
   * @param {Object} message - Message to send
   * @returns {Promise<Object>} - Send result
   */
  async sendMessage(sock, message) {
    try {
      // Format phone number
      const formattedPhone = message.phone.replace(/\D/g, "");
      const whatsappId = `${formattedPhone}@s.whatsapp.net`;

      // Send message
      const result = await sock.sendMessage(whatsappId, {
        text: message.finalMessage,
      });

      return {
        success: true,
        messageId: result.key.id,
        phone: message.phone,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        phone: message.phone,
      };
    }
  }

  /**
   * Apply range management delays
   * @param {string} sessionId - Session ID
   * @param {Object} executionState - Current execution state
   */
  async applyRangeDelays(sessionId, executionState) {
    // Get session config
    const session = await BlastSession.findOne({ where: { sessionId } });
    const config = session.config || {};

    // Message delay (2-10 seconds)
    const messageDelay = config.messageDelay || { min: 2, max: 10 };
    const delay =
      Math.random() * (messageDelay.max - messageDelay.min) + messageDelay.min;

    logger.debug(`⏱️ Applying message delay: ${delay.toFixed(2)}s`);
    await this.sleep(delay * 1000);

    // Check for rest periods
    const restThreshold = config.restThreshold || { min: 50, max: 100 };
    if (
      executionState.processedCount > 0 &&
      executionState.processedCount % restThreshold.min === 0
    ) {
      const restDelay = config.restDelay || { min: 10, max: 30 };
      const restTime =
        Math.random() * (restDelay.max - restDelay.min) + restDelay.min;

      logger.info(`😴 Taking rest break: ${restTime.toFixed(2)} minutes`);
      await this.sleep(restTime * 60 * 1000);
    }
  }

  /**
   * Update session progress in database
   * @param {string} sessionId - Session ID
   * @param {Object} executionState - Current execution state
   */
  async updateSessionProgress(sessionId, executionState) {
    try {
      const session = await BlastSession.findOne({ where: { sessionId } });
      if (!session) return;

      // Get actual queue statistics for more accurate progress calculation
      const queueStats = await messageQueueHandler.getQueueStats(sessionId);

      // Calculate progress based on actual queue data
      const totalProcessed =
        queueStats.sent + queueStats.failed + queueStats.skipped;
      const progressPercentage =
        queueStats.total > 0
          ? Math.min(100, (totalProcessed / queueStats.total) * 100) // Cap at 100%
          : 0;

      // Update with current timestamp to show activity
      await session.update({
        currentIndex: executionState.currentIndex,
        sentCount: queueStats.sent, // Use queue stats for accuracy
        failedCount: queueStats.failed, // Use queue stats for accuracy
        skippedCount: queueStats.skipped || 0, // Include skipped count
        progressPercentage: parseFloat(progressPercentage.toFixed(2)),
        updatedAt: new Date(), // Force update timestamp
      });

      // Log progress every 10 messages for debugging
      if (executionState.processedCount % 10 === 0) {
        logger.info(
          `📊 Session ${sessionId} progress: ${totalProcessed}/${session.totalMessages} (${progressPercentage}%)`
        );
      }

      // Emit toast for progress milestones (25%, 50%, 75%)
      const milestones = [25, 50, 75];
      const currentProgress = parseFloat(progressPercentage);

      milestones.forEach((milestone) => {
        const previousProgress = session.progressPercentage || 0;
        if (previousProgress < milestone && currentProgress >= milestone) {
          _emitToastNotification(
            "info",
            "Progress Update",
            `Campaign ${
              session.campaignName || sessionId
            } telah mencapai ${milestone}% (${totalProcessed}/${
              session.totalMessages
            } pesan)`,
            sessionId
          );
        }
      });
    } catch (error) {
      logger.error(
        `❌ Failed to update session progress for ${sessionId}:`,
        error
      );
    }
  }

  /**
   * Pause execution
   * @param {string} sessionId - Session ID
   */
  async pauseExecution(sessionId) {
    const executionState = this.runningExecutions.get(sessionId);

    // If no in-memory state, update database directly
    if (!executionState) {
      logger.warn(
        `⚠️ No in-memory execution state for ${sessionId}, updating database directly`
      );

      const session = await BlastSession.findOne({ where: { sessionId } });
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      await session.update({
        status: "PAUSED",
        pausedAt: new Date(),
      });

      // PERBAIKAN: Schedule auto-resume juga untuk database-only pause
      const businessHoursConfig = session.config?.businessHours;
      if (businessHoursConfig?.enabled) {
        this.scheduleBusinessHoursCheck(sessionId, businessHoursConfig);
        logger.info(
          `⏰ Auto-resume scheduled for ${sessionId} (database-only pause)`
        );
      }

      logger.info(`⏸️ Session ${sessionId} paused (database only)`);

      // Emit UI update for pause
      _emitSessionsUpdate(sessionId);

      // Emit toast notification for manual pause
      _emitToastNotification(
        "info",
        "Campaign Dijeda",
        `Campaign ${sessionId} telah dijeda secara manual`,
        sessionId
      );

      return {
        success: true,
        sessionId,
        message: "Session paused (database updated) with auto-resume scheduled",
      };
    }

    // Normal pause with in-memory state
    executionState.isPaused = true;
    executionState.pausedAt = new Date();

    // Also update database
    await BlastSession.update(
      {
        status: "PAUSED",
        pausedAt: new Date(),
      },
      { where: { sessionId } }
    );

    logger.info(`⏸️ Execution paused for session ${sessionId}`);

    // Emit UI update for pause
    _emitSessionsUpdate(sessionId);

    // Emit toast notification for manual pause (in-memory)
    _emitToastNotification(
      "info",
      "Campaign Dijeda",
      `Campaign ${sessionId} telah dijeda`,
      sessionId
    );

    return {
      success: true,
      sessionId,
      message: "Execution paused",
    };
  }

  /**
   * Resume execution
   * @param {string} sessionId - Session ID
   */
  async resumeExecution(sessionId) {
    // Clear business hours timer if exists
    if (this.businessHoursTimers.has(sessionId)) {
      clearTimeout(this.businessHoursTimers.get(sessionId));
      this.businessHoursTimers.delete(sessionId);
    }

    const executionState = this.runningExecutions.get(sessionId);

    // If no in-memory state, restart execution
    if (!executionState) {
      logger.warn(
        `⚠️ No in-memory execution state for ${sessionId}, restarting execution`
      );

      const session = await BlastSession.findOne({ where: { sessionId } });
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      // Update status to RUNNING and restart
      await session.update({
        status: "RUNNING",
        resumedAt: new Date(),
      });

      // Emit UI update for resume
      _emitSessionsUpdate(sessionId);

      // Emit toast notification for resume (database-only)
      _emitToastNotification(
        "success",
        "Campaign Dilanjutkan",
        `Campaign ${sessionId} telah dilanjutkan`,
        sessionId
      );

      // Start execution (don't force start, let it check business hours normally)
      return this.startExecution(sessionId, false);
    }

    // Normal resume with in-memory state
    executionState.isPaused = false;
    executionState.resumedAt = new Date();

    // Also update database
    await BlastSession.update(
      {
        status: "RUNNING",
        resumedAt: new Date(),
      },
      { where: { sessionId } }
    );

    logger.info(`▶️ Execution resumed for session ${sessionId}`);

    // Emit UI update for resume
    _emitSessionsUpdate(sessionId);

    // Emit toast notification for manual resume
    _emitToastNotification(
      "success",
      "Campaign Dilanjutkan",
      `Campaign ${sessionId} telah dilanjutkan`,
      sessionId
    );

    return {
      success: true,
      sessionId,
      message: "Execution resumed",
    };
  }

  /**
   * Stop execution
   * @param {string} sessionId - Session ID
   */
  async stopExecution(sessionId) {
    const executionState = this.runningExecutions.get(sessionId);

    // If no in-memory state, update database directly
    if (!executionState) {
      logger.warn(
        `⚠️ No in-memory execution state for ${sessionId}, updating database directly`
      );

      const session = await BlastSession.findOne({ where: { sessionId } });
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      // Update database status to STOPPED
      await session.update({
        status: "STOPPED",
        stoppedAt: new Date(),
      });

      // Clear business hours timer if exists
      if (this.businessHoursTimers.has(sessionId)) {
        clearTimeout(this.businessHoursTimers.get(sessionId));
        this.businessHoursTimers.delete(sessionId);
        logger.info(`⏰ Cleared auto-resume timer for ${sessionId}`);
      }

      logger.info(`⏹️ Session ${sessionId} stopped (database only)`);

      // Emit update
      _emitSessionsUpdate(sessionId);

      return {
        success: true,
        sessionId,
        message: "Session stopped (database updated)",
      };
    }

    // Normal stop with in-memory state
    executionState.isStopped = true;
    executionState.stoppedAt = new Date();

    // Clear update interval
    if (executionState.updateInterval) {
      clearInterval(executionState.updateInterval);
    }

    // Clear business hours timer if exists
    if (this.businessHoursTimers.has(sessionId)) {
      clearTimeout(this.businessHoursTimers.get(sessionId));
      this.businessHoursTimers.delete(sessionId);
    }

    // Update database
    await BlastSession.update(
      {
        status: "STOPPED",
        stoppedAt: new Date(),
      },
      { where: { sessionId } }
    );

    // Remove from running executions
    this.runningExecutions.delete(sessionId);

    logger.info(`⏹️ Execution stopped for session ${sessionId}`);

    // Emit final update
    _emitSessionsUpdate(sessionId);

    return {
      success: true,
      sessionId,
      message: "Execution stopped",
    };
  }

  /**
   * Complete execution
   * @param {string} sessionId - Session ID
   */
  async completeExecution(sessionId) {
    try {
      const executionState = this.runningExecutions.get(sessionId);

      // Handle in-memory state if exists
      if (executionState) {
        executionState.status = "COMPLETED";
        executionState.completedAt = new Date();

        // Clear update interval
        if (executionState.updateInterval) {
          clearInterval(executionState.updateInterval);
        }
      } else {
        logger.warn(
          `⚠️ No in-memory execution state for ${sessionId} during completion`
        );
      }

      // Get final queue statistics
      const queueStats = await messageQueueHandler.getQueueStats(sessionId);

      // Update session status in database with final progress
      await BlastSession.update(
        {
          status: "COMPLETED",
          completedAt: new Date(),
          progressPercentage: 100.0, // Force 100% on completion
          sentCount: queueStats.sent,
          failedCount: queueStats.failed,
          skippedCount: queueStats.skipped || 0,
        },
        { where: { sessionId } }
      );

      // Clear business hours timer if exists
      if (this.businessHoursTimers.has(sessionId)) {
        clearTimeout(this.businessHoursTimers.get(sessionId));
        this.businessHoursTimers.delete(sessionId);
      }

      // Remove from running executions
      this.runningExecutions.delete(sessionId);

      logger.info(`✅ Execution completed for session ${sessionId}`);

      // Get session details for toast
      const session = await BlastSession.findOne({ where: { sessionId } });

      // Emit final update
      _emitSessionsUpdate(sessionId);

      // Emit toast notification for completion
      _emitToastNotification(
        "success",
        "Campaign Selesai",
        `Campaign ${
          session?.campaignName || sessionId
        } telah selesai. Total terkirim: ${session?.sentCount || 0}, Gagal: ${
          session?.failedCount || 0
        }`,
        sessionId
      );

      return {
        success: true,
        sessionId,
        message: "Execution completed",
      };
    } catch (error) {
      logger.error(`❌ Failed to complete execution for ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Handle execution error
   * @param {string} sessionId - Session ID
   * @param {Error} error - Error object
   */
  async handleExecutionError(sessionId, error) {
    try {
      // Update session status to error
      await BlastSession.update(
        {
          status: "ERROR",
          errorMessage: error.message,
          stoppedAt: new Date(),
        },
        { where: { sessionId } }
      );

      // Clear update interval
      const executionState = this.runningExecutions.get(sessionId);
      if (executionState) {
        clearInterval(executionState.updateInterval);
      }

      // Remove from running executions
      this.runningExecutions.delete(sessionId);

      logger.error(
        `💥 Execution error for session ${sessionId}: ${error.message}`
      );

      // Emit final update
      _emitSessionsUpdate(sessionId);

      // Emit toast notification for error
      _emitToastNotification(
        "error",
        "Campaign Error",
        `Campaign ${sessionId} mengalami error: ${error.message}`,
        sessionId
      );
    } catch (updateError) {
      logger.error(
        `❌ Failed to handle execution error for ${sessionId}:`,
        updateError
      );
    }
  }

  /**
   * Get execution status
   * @param {string} sessionId - Session ID
   * @returns {Object} - Execution status
   */
  getExecutionStatus(sessionId) {
    const executionState = this.runningExecutions.get(sessionId);

    if (!executionState) {
      return {
        isRunning: false,
        status: "NOT_RUNNING",
      };
    }

    return {
      isRunning: true,
      status: executionState.status,
      isPaused: executionState.isPaused,
      isStopped: executionState.isStopped,
      startedAt: executionState.startedAt,
      pausedAt: executionState.pausedAt,
      resumedAt: executionState.resumedAt,
      processedCount: executionState.processedCount,
      successCount: executionState.successCount,
      failedCount: executionState.failedCount,
      currentIndex: executionState.currentIndex,
    };
  }

  /**
   * Force UI update for all sessions
   */
  async forceUIUpdate() {
    logger.info("🔄 Forcing UI update for all sessions");
    _emitSessionsUpdate(sessionId);
  }

  /**
   * Get comprehensive session status (database + in-memory)
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object>} - Comprehensive status
   */
  async getComprehensiveStatus(sessionId) {
    try {
      const session = await BlastSession.findOne({ where: { sessionId } });
      const executionState = this.runningExecutions.get(sessionId);

      return {
        database: session
          ? {
              status: session.status,
              progressPercentage: session.progressPercentage,
              sentCount: session.sentCount,
              failedCount: session.failedCount,
              totalMessages: session.totalMessages,
              currentIndex: session.currentIndex,
              updatedAt: session.updatedAt,
            }
          : null,
        inMemory: executionState
          ? {
              status: executionState.status,
              isPaused: executionState.isPaused,
              isStopped: executionState.isStopped,
              processedCount: executionState.processedCount,
              successCount: executionState.successCount,
              failedCount: executionState.failedCount,
            }
          : null,
        hasTimer: this.businessHoursTimers.has(sessionId),
      };
    } catch (error) {
      logger.error(
        `❌ Failed to get comprehensive status for ${sessionId}:`,
        error
      );
      return null;
    }
  }

  /**
   * Sleep utility
   * @param {number} ms - Milliseconds to sleep
   */
  /**
   * Check if current time is within business hours
   * @param {Object} businessHoursConfig - Business hours configuration
   * @returns {boolean} - True if within business hours, false otherwise
   */
  isWithinBusinessHours(businessHoursConfig) {
    if (!businessHoursConfig || !businessHoursConfig.enabled) {
      return true;
    }

    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay();

    const {
      startHour = 8,
      endHour = 17,
      excludeWeekends = false,
      excludeLunchBreak = false,
      lunchStart = 12,
      lunchEnd = 13,
    } = businessHoursConfig;

    // Check weekends (0 = Sunday, 6 = Saturday)
    if (excludeWeekends && (currentDay === 0 || currentDay === 6)) {
      return false;
    }

    // Check business hours
    if (currentHour < startHour || currentHour >= endHour) {
      return false;
    }

    // Check lunch break
    if (
      excludeLunchBreak &&
      currentHour >= lunchStart &&
      currentHour < lunchEnd
    ) {
      return false;
    }

    return true;
  }

  /**
   * Sleep utility
   * @param {number} ms - Milliseconds to sleep
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get all running executions
   * @returns {Array} - Array of running execution states
   */
  getRunningExecutions() {
    return Array.from(this.runningExecutions.values());
  }

  /**
   * Cleanup all timers and running executions (for graceful shutdown)
   */
  cleanup() {
    logger.info("🧹 Cleaning up blast execution service...");

    // Clear all business hours timers
    for (const [sessionId, timer] of this.businessHoursTimers) {
      clearTimeout(timer);
      logger.debug(`⏰ Cleared timer for session ${sessionId}`);
    }
    this.businessHoursTimers.clear();

    // Clear all execution intervals
    for (const [sessionId, executionState] of this.runningExecutions) {
      if (executionState.updateInterval) {
        clearInterval(executionState.updateInterval);
        logger.debug(`⏹️ Cleared interval for session ${sessionId}`);
      }
    }

    logger.info("✅ Blast execution service cleanup completed");
  }

  /**
   * Get next business hours start time
   * @param {Object} businessHoursConfig - Business hours configuration
   * @returns {Date} - Next business hours start time
   */
  getNextBusinessHoursStart(businessHoursConfig) {
    const now = new Date();
    const { startHour = 8, excludeWeekends = false } = businessHoursConfig;

    // If currently within business hours, start immediately
    if (this.isWithinBusinessHours(businessHoursConfig)) {
      return now;
    }

    // Calculate next start time
    let nextStart = new Date();
    nextStart.setHours(startHour, 0, 0, 0);

    // If time has passed today, move to tomorrow
    if (nextStart <= now) {
      nextStart.setDate(nextStart.getDate() + 1);
    }

    // Skip weekends if configured
    if (excludeWeekends) {
      while (nextStart.getDay() === 0 || nextStart.getDay() === 6) {
        nextStart.setDate(nextStart.getDate() + 1);
      }
    }

    return nextStart;
  }

  /**
   * Initialize auto-resume scheduler for existing paused sessions
   */
  async initializeAutoResumeScheduler() {
    try {
      logger.info(
        "🔄 Initializing auto-resume scheduler for paused sessions..."
      );

      const pausedSessions = await BlastSession.findAll({
        where: { status: "PAUSED" },
      });

      logger.info(`📊 Found ${pausedSessions.length} paused sessions to check`);

      for (const session of pausedSessions) {
        const businessHoursConfig = session.config?.businessHours;
        if (businessHoursConfig?.enabled) {
          // Check if should resume immediately
          if (this.isWithinBusinessHours(businessHoursConfig)) {
            logger.info(
              `🚀 Auto-resuming paused session ${session.sessionId} - within business hours`
            );
            await this.resumeExecution(session.sessionId);
          } else {
            // Schedule for later
            this.scheduleBusinessHoursCheck(
              session.sessionId,
              businessHoursConfig
            );
            logger.info(
              `⏰ Scheduled auto-resume for session ${session.sessionId}`
            );
          }
        }
      }

      logger.info("✅ Auto-resume scheduler initialization completed");
    } catch (error) {
      logger.error("❌ Failed to initialize auto-resume scheduler:", error);
    }
  }

  /**
   * Schedule business hours check for auto-resume
   * @param {string} sessionId - Session ID
   * @param {Object} businessHoursConfig - Business hours configuration
   */
  scheduleBusinessHoursCheck(sessionId, businessHoursConfig) {
    // Clear existing timer if any
    if (this.businessHoursTimers.has(sessionId)) {
      clearTimeout(this.businessHoursTimers.get(sessionId));
    }

    const nextCheckTime = this.getNextBusinessHoursStart(businessHoursConfig);
    const timeUntilNext = nextCheckTime.getTime() - Date.now();

    // Don't schedule if it's more than 24 hours away, schedule for next hour instead
    const scheduleTime =
      timeUntilNext > 24 * 60 * 60 * 1000 ? 60 * 60 * 1000 : timeUntilNext;

    logger.info(
      `⏰ Scheduling auto-resume check for session ${sessionId} in ${Math.round(
        scheduleTime / 60000
      )} minutes`
    );

    const timer = setTimeout(async () => {
      try {
        // Remove timer from map
        this.businessHoursTimers.delete(sessionId);

        const session = await BlastSession.findOne({ where: { sessionId } });
        if (!session || session.status !== "PAUSED") {
          return; // Session no longer exists or not paused
        }

        if (this.isWithinBusinessHours(businessHoursConfig)) {
          logger.info(
            `🚀 Auto-resuming session ${sessionId} - business hours started`
          );
          await this.resumeExecution(sessionId);

          // Force UI update after auto-resume
          setTimeout(_emitSessionsUpdate, 1000);

          // Additional toast for scheduled auto-resume
          _emitToastNotification(
            "success",
            "Campaign Auto-Resume",
            `Campaign ${sessionId} telah dimulai otomatis sesuai jadwal jam kerja`,
            sessionId
          );
        } else {
          // Schedule next check
          this.scheduleBusinessHoursCheck(sessionId, businessHoursConfig);
        }
      } catch (error) {
        logger.error(`❌ Failed to auto-resume session ${sessionId}:`, error);
        // Schedule retry in 10 minutes
        setTimeout(() => {
          this.scheduleBusinessHoursCheck(sessionId, businessHoursConfig);
        }, 10 * 60 * 1000);
      }
    }, scheduleTime);

    this.businessHoursTimers.set(sessionId, timer);
  }

  /**
   * Force start a session (bypass business hours)
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object>} - Start result
   */
  async forceStartExecution(sessionId) {
    return this.startExecution(sessionId, true);
  }

  /**
   * Initialize auto-resume scheduler for existing paused sessions
   */
  async initializeAutoResumeScheduler() {
    try {
      const pausedSessions = await BlastSession.findAll({
        where: { status: "PAUSED" },
      });

      for (const session of pausedSessions) {
        const businessHoursConfig = session.config?.businessHours;
        if (businessHoursConfig?.enabled) {
          // Check if should resume immediately
          if (this.isWithinBusinessHours(businessHoursConfig)) {
            logger.info(
              `🚀 Auto-resuming paused session ${session.sessionId} - within business hours`
            );
            await this.resumeExecution(session.sessionId);
          } else {
            // Schedule for later
            this.scheduleBusinessHoursCheck(
              session.sessionId,
              businessHoursConfig
            );
          }
        }
      }
    } catch (error) {
      logger.error("❌ Failed to initialize auto-resume scheduler:", error);
    }
  }

  /**
   * Recover execution state after server restart
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object>} - Recovery result
   */
  async recoverExecution(sessionId) {
    try {
      const session = await BlastSession.findOne({ where: { sessionId } });
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      // Only recover if session was actually running
      if (session.status === "RUNNING") {
        logger.info(`🔄 Recovering execution for session: ${sessionId}`);
        return this.startExecution(sessionId, true); // Force start to bypass checks
      } else if (session.status === "PAUSED") {
        logger.info(
          `⏸️ Session ${sessionId} was paused, setting up auto-resume`
        );

        // Set up auto-resume for paused sessions
        const businessHoursConfig = session.config?.businessHours;
        if (businessHoursConfig?.enabled) {
          if (this.isWithinBusinessHours(businessHoursConfig)) {
            logger.info(
              `🚀 Auto-resuming session ${sessionId} - within business hours`
            );
            return this.resumeExecution(sessionId);
          } else {
            this.scheduleBusinessHoursCheck(sessionId, businessHoursConfig);
          }
        }

        return {
          success: true,
          sessionId,
          message: "Session remains paused with auto-resume scheduled",
          status: "PAUSED",
        };
      }

      return {
        success: false,
        sessionId,
        message: `Session status ${session.status} does not require recovery`,
      };
    } catch (error) {
      logger.error(`❌ Failed to recover execution for ${sessionId}:`, error);
      throw error;
    }
  }
}

// Export singleton instance
module.exports = new BlastExecutionService();
