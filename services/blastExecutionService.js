const logger = require("../utils/logger");
const { getSocket } = require("../auth/socket");
const { getSock } = require("../auth/session");
const blastSessionManager = require("../utils/blastSessionManager");
const messageQueueHandler = require("../utils/messageQueueHandler");
const BlastSession = require("../models/blastSessionModel");
const BlastMessage = require("../models/blastMessageModel");
const SpinTextEngine = require("../utils/spinTextEngine");

const _emitSessionsUpdate = async () => {
  try {
    const sessions = await BlastSession.findAll({
      order: [["createdAt", "DESC"]],
    });
    getSocket().emit("sessions-update", sessions);
  } catch (error)
 {
    logger.error("Failed to emit session update:", error);
  }
};

/**
 * Blast Execution Service
 * Handles the actual execution of blast sessions with pause/resume/stop support
 */
class BlastExecutionService {
  constructor() {
    this.runningExecutions = new Map(); // sessionId -> execution state
  }

  /**
   * Start executing a blast session
   * @param {string} sessionId - Session ID to execute
   * @returns {Promise<Object>} - Execution result
   */
  async startExecution(sessionId) {
    try {
      logger.info(`🚀 Starting blast execution for session: ${sessionId}`);

      // Get session details
      const session = await BlastSession.findOne({ where: { sessionId } });
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      // Check if already running in-memory. If so, and DB status allows, clear stale state.
      if (this.runningExecutions.has(sessionId)) {
        if (session.status === "IDLE" || session.status === "PAUSED") {
          logger.warn(`⚠️ Stale execution state found for session ${sessionId}. Clearing and restarting.`);
          clearInterval(this.runningExecutions.get(sessionId).updateInterval);
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
      const updateInterval = setInterval(_emitSessionsUpdate, 2000); // Update every 2 seconds

      executionState.updateInterval = updateInterval;

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
        if (businessHoursConfig.enabled && !this.isWithinBusinessHours(businessHoursConfig)) {
          logger.info(`⏰ Session ${sessionId} is outside business hours. Pausing until ${businessHoursConfig.startHour}:00.`);
          executionState.isPaused = true; // Temporarily pause
          await this.sleep(60 * 60 * 1000); // Sleep for 1 hour before re-checking
          continue;
        } else if (businessHoursConfig.enabled && executionState.isPaused && this.isWithinBusinessHours(businessHoursConfig)) {
          // If it was paused due to business hours and now it's within, resume
          logger.info(`✅ Session ${sessionId} is now within business hours. Resuming.`);
          executionState.isPaused = false;
        }

        // Get next batch of messages
        const messages = await messageQueueHandler.getNextBatch(sessionId, 1);

        if (messages.length === 0) {
          // No more messages to process
          logger.info(`✅ All messages processed for session ${sessionId}`);
          await this.completeExecution(sessionId);
          break;
        }

        const message = messages[0];

        try {
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

      const totalProcessed =
        executionState.successCount + executionState.failedCount;
      const progressPercentage =
        session.totalMessages > 0
          ? ((totalProcessed / session.totalMessages) * 100).toFixed(2)
          : 0;

      await session.update({
        currentIndex: executionState.currentIndex,
        sentCount: executionState.successCount,
        failedCount: executionState.failedCount,
        progressPercentage: parseFloat(progressPercentage),
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
    if (!executionState) {
      throw new Error(`No running execution found for session ${sessionId}`);
    }

    executionState.isPaused = true;
    executionState.pausedAt = new Date();

    logger.info(`⏸️ Execution paused for session ${sessionId}`);

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
    const executionState = this.runningExecutions.get(sessionId);
    if (!executionState) {
      throw new Error(`No execution found for session ${sessionId}`);
    }

    executionState.isPaused = false;
    executionState.resumedAt = new Date();

    logger.info(`▶️ Execution resumed for session ${sessionId}`);

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
    if (!executionState) {
      throw new Error(`No running execution found for session ${sessionId}`);
    }

    executionState.isStopped = true;
    executionState.stoppedAt = new Date();

    // Clear update interval
    clearInterval(executionState.updateInterval);

    // Remove from running executions
    this.runningExecutions.delete(sessionId);

    logger.info(`⏹️ Execution stopped for session ${sessionId}`);

    // Emit final update
    _emitSessionsUpdate();

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
      if (executionState) {
        executionState.status = "COMPLETED";
        executionState.completedAt = new Date();
      }

      // Update session status
      await BlastSession.update(
        {
          status: "COMPLETED",
          completedAt: new Date(),
        },
        { where: { sessionId } }
      );

      // Clear update interval
      if (executionState) {
        clearInterval(executionState.updateInterval);
      }

      // Remove from running executions
      this.runningExecutions.delete(sessionId);

      logger.info(`✅ Execution completed for session ${sessionId}`);

      // Emit final update
      _emitSessionsUpdate();

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
      _emitSessionsUpdate();
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
      return true; // Business hours not enabled, always within
    }

    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay(); // 0 for Sunday, 1 for Monday, ..., 6 for Saturday

    const {
      startHour,
      endHour,
      excludeWeekends,
      excludeLunchBreak,
      lunchStart,
      lunchEnd,
    } = businessHoursConfig;

    // Check weekends
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
}

// Export singleton instance
module.exports = new BlastExecutionService();
