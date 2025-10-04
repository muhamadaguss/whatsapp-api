const logger = require("../utils/logger");
const { getSocket } = require("../auth/socket");
const { getSock } = require("../auth/session");
const blastSessionManager = require("../utils/blastSessionManager");
const messageQueueHandler = require("../utils/messageQueueHandler");
const BlastSession = require("../models/blastSessionModel");
const BlastMessage = require("../models/blastMessageModel");
const SpinTextEngine = require("../utils/spinTextEngine");
const BlastRealTimeService = require("./blastRealTimeService");

// Create singleton instance
const blastRealTimeService = new BlastRealTimeService(); // Import real-time service

const _emitSessionsUpdate = async (sessionId = null) => {
  try {
    // Use enhanced real-time service for better session updates
    if (sessionId) {
      // Get userId from sessionId for targeted emission
      const session = await BlastSession.findOne({
        where: { sessionId },
        attributes: ['userId']
      });
      
      if (session) {
        await blastRealTimeService.emitSessionsUpdate(session.userId);
        logger.debug(`📡 Emitted sessions update via real-time service to user ${session.userId}`);
      }
    } else {
      await blastRealTimeService.emitSessionsUpdate();
      logger.debug(`📡 Emitted sessions update via real-time service to all users`);
    }
  } catch (error) {
    logger.error("❌ Failed to emit session update via real-time service:", error);
    
    // Fallback to original implementation
    try {
      const socket = getSocket();
      if (!socket) {
        logger.warn("⚠️ Socket not available for sessions update fallback");
        return;
      }

      if (sessionId) {
        const session = await BlastSession.findOne({
          where: { sessionId },
          attributes: ['userId']
        });
        
        if (session) {
          const userSessions = await BlastSession.findAll({
            where: { userId: session.userId },
            include: [
              {
                model: require("../models/sessionModel"),
                as: "whatsappSession",
                attributes: ["sessionId", "phoneNumber", "displayName", "status", "connectionQuality"]
              }
            ],
            order: [["createdAt", "DESC"]],
          });

          // Transform whatsappSession to whatsappAccount for frontend compatibility
          const transformedSessions = userSessions.map(session => {
            const sessionData = session.toJSON();
            
            // Transform whatsappSession to whatsappAccount
            if (sessionData.whatsappSession) {
              sessionData.whatsappAccount = {
                sessionId: sessionData.whatsappSession.sessionId,
                phoneNumber: sessionData.whatsappSession.phoneNumber,
                displayName: sessionData.whatsappSession.displayName || `Account ${sessionData.whatsappSession.phoneNumber}`,
                status: sessionData.whatsappSession.status,
                profilePicture: sessionData.whatsappSession.profilePicture,
                lastSeen: sessionData.whatsappSession.lastSeen,
                connectionQuality: sessionData.whatsappSession.connectionQuality || 'unknown',
                operatorInfo: sessionData.whatsappSession.metadata?.operatorInfo || null
              };
            } else {
              // Fallback untuk missing WhatsApp session data
              sessionData.whatsappAccount = {
                sessionId: sessionData.whatsappSessionId,
                phoneNumber: null,
                displayName: 'Account Information Unavailable',
                status: 'unknown',
                profilePicture: null,
                lastSeen: null,
                connectionQuality: 'unknown',
                operatorInfo: null
              };
            }

            // Remove the nested whatsappSession object
            delete sessionData.whatsappSession;
            
            return sessionData;
          });

          socket.to(`user_${session.userId}`).emit("sessions-update", transformedSessions);
          logger.debug(`📡 Fallback: Emitted sessions update to user ${session.userId}: ${transformedSessions.length} sessions`);
        }
      } else {
        const allUsers = await BlastSession.findAll({
          attributes: ['userId'],
          group: ['userId'],
          raw: true
        });
        
        for (const userObj of allUsers) {
          const userSessions = await BlastSession.findAll({
            where: { userId: userObj.userId },
            include: [
              {
                model: require("../models/sessionModel"),
                as: "whatsappSession",
                attributes: ["sessionId", "phoneNumber", "displayName", "status", "connectionQuality"]
              }
            ],
            order: [["createdAt", "DESC"]],
          });

          // Transform whatsappSession to whatsappAccount for frontend compatibility
          const transformedSessions = userSessions.map(session => {
            const sessionData = session.toJSON();
            
            // Transform whatsappSession to whatsappAccount
            if (sessionData.whatsappSession) {
              sessionData.whatsappAccount = {
                sessionId: sessionData.whatsappSession.sessionId,
                phoneNumber: sessionData.whatsappSession.phoneNumber,
                displayName: sessionData.whatsappSession.displayName || `Account ${sessionData.whatsappSession.phoneNumber}`,
                status: sessionData.whatsappSession.status,
                profilePicture: sessionData.whatsappSession.profilePicture,
                lastSeen: sessionData.whatsappSession.lastSeen,
                connectionQuality: sessionData.whatsappSession.connectionQuality || 'unknown',
                operatorInfo: sessionData.whatsappSession.metadata?.operatorInfo || null
              };
            } else {
              // Fallback untuk missing WhatsApp session data
              sessionData.whatsappAccount = {
                sessionId: sessionData.whatsappSessionId,
                phoneNumber: null,
                displayName: 'Account Information Unavailable',
                status: 'unknown',
                profilePicture: null,
                lastSeen: null,
                connectionQuality: 'unknown',
                operatorInfo: null
              };
            }

            // Remove the nested whatsappSession object
            delete sessionData.whatsappSession;
            
            return sessionData;
          });

          socket.to(`user_${userObj.userId}`).emit("sessions-update", transformedSessions);
        }
        logger.debug(`📡 Fallback: Emitted sessions update to all users: ${allUsers.length} users`);
      }
    } catch (fallbackError) {
      logger.error("❌ Fallback session update also failed:", fallbackError);
    }
  }
};

/**
 * Emit toast notification to frontend
 * @param {string} type - Toast type: 'success', 'error', 'warning', 'info'
 * @param {string} title - Toast title
 * @param {string} description - Toast description
 * @param {string} sessionId - Session ID (optional)
 * @param {number} userId - User ID (optional)
 */
const _emitToastNotification = (type, title, description, sessionId = null, userId = null) => {
  try {
    // Use enhanced real-time service for toast notifications
    blastRealTimeService.emitToastNotification(type, title, description, userId, sessionId);
  } catch (error) {
    logger.error("❌ Failed to emit toast notification via real-time service:", error);
    
    // Fallback to original implementation
    try {
      const socket = getSocket();
      if (socket) {
        const toastData = {
          type,
          title,
          description,
          sessionId,
          timestamp: new Date().toISOString(),
        };
        
        if (userId) {
          socket.to(`user_${userId}`).emit("toast-notification", toastData);
        } else {
          socket.emit("toast-notification", toastData);
        }
        
        logger.debug(`🍞 Fallback: Emitted toast: ${type} - ${title}`);
      } else {
        logger.warn("⚠️ Socket not available for toast notification fallback");
      }
    } catch (fallbackError) {
      logger.error("❌ Fallback toast notification also failed:", fallbackError);
    }
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

    // Note: Auto-resume scheduler will be initialized when the service is first used
    // this.initializeAutoResumeScheduler();
  }

  /**
   * Initialize auto-resume scheduler for existing paused sessions
   */
  async initializeAutoResumeScheduler() {
    try {
      // Check if database models are available
      if (!BlastSession || typeof BlastSession.findAll !== 'function') {
        logger.warn('⚠️ BlastSession model not available for auto-resume scheduler initialization');
        return;
      }

      // Find all paused sessions and schedule auto-resume checks
      const pausedSessions = await BlastSession.findAll({
        where: { status: 'PAUSED' }
      });

      for (const session of pausedSessions) {
        const businessHoursConfig = session.config?.businessHours;
        if (businessHoursConfig?.enabled) {
          this.scheduleBusinessHoursCheck(session.sessionId, businessHoursConfig);
        }
      }

      logger.info(`✅ Initialized auto-resume scheduler for ${pausedSessions.length} paused sessions`);
    } catch (error) {
      logger.error('❌ Error initializing auto-resume scheduler:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      // Don't throw error - this is initialization, not critical functionality
    }
  }  /**
   * Start executing a blast session
   * @param {string} sessionId - Session ID to execute
   * @param {boolean} forceStart - Force start ignoring business hours and current status
   * @returns {Promise<Object>} - Execution result
   */
  async startExecution(sessionId, forceStart = false) {
    try {
      // Initialize auto-resume scheduler if not already done
      if (!this.autoResumeInitialized) {
        this.autoResumeInitialized = true;
        // Initialize in background, don't wait for it
        this.initializeAutoResumeScheduler().catch(error => {
          logger.warn('⚠️ Auto-resume scheduler initialization failed:', error.message);
        });
      }

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

      // Check session health before starting (unless forced)
      if (!forceStart) {
        const healthCheck = await this.checkSessionHealth(sessionId);
        if (!healthCheck.healthy) {
          logger.error(`🚫 Session health check failed for ${sessionId}: ${healthCheck.reason}`);

          // Update session status to ERROR
          await session.update({
            status: "ERROR",
            errorMessage: `Health check failed: ${healthCheck.reason}`,
            errorCode: healthCheck.errorCode || "HEALTH_CHECK_FAILED",
          });

          // Emit error notification
          _emitToastNotification(
            "error",
            "Session Health Check Failed",
            `Cannot start blast: ${healthCheck.reason}`,
            sessionId
          );

          throw new Error(`Session health check failed: ${healthCheck.reason}`);
        }
      } else {
        logger.warn(`⚠️ Force starting session ${sessionId} - bypassing health check`);
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
        totalMessages: session.totalMessages || 0,
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
        // Periodic health check (every 10 messages or every 30 seconds)
        if (
          executionState.processedCount > 0 &&
          (executionState.processedCount % 10 === 0 ||
           Date.now() - (executionState.lastHealthCheck || 0) > 30000)
        ) {
          executionState.lastHealthCheck = Date.now();
          const isHealthy = await this.monitorSessionHealth(sessionId, executionState);
          if (!isHealthy) {
            logger.error(`🚨 Session became unhealthy during execution, stopping ${sessionId}`);
            break;
          }
        }

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
            // Check if this is a session-level error that should stop execution
            if (result.isSessionError) {
              logger.error(`🚫 Session error detected, stopping execution: ${result.errorType}`);
              executionState.isStopped = true;
              executionState.stopReason = result.errorType;

              // Mark current message as failed
              await messageQueueHandler.markAsFailed(message.id, result.error);
              executionState.failedCount++;

              // Break out of processing loop
              break;
            }

            // Regular message failure
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
   * Send a message using WhatsApp socket
   * @param {Object} sock - WhatsApp socket
   * @param {Object} message - Message object
   * @returns {Promise<Object>} - Send result
   */
  async sendMessage(sock, message) {
    try {
      // Prepare message content - use finalMessage if available, otherwise messageTemplate
      const messageText = message.finalMessage || message.messageTemplate;

      if (!messageText) {
        throw new Error('No message content available');
      }

      // For now, only support text messages
      const messageContent = { text: messageText };

      // Send the message
      const result = await sock.sendMessage(message.phone + '@s.whatsapp.net', messageContent);

      return {
        success: true,
        messageId: result.key.id,
        timestamp: result.messageTimestamp
      };

    } catch (error) {
      logger.error(`❌ Failed to send message to ${message.phone}:`, error);

      // Categorize the error
      let isSessionError = false;
      let errorType = 'unknown';
      let canRetry = true;

      const errorMessage = error.message.toLowerCase();

      // Check for session-level errors
      if (errorMessage.includes('connection') ||
          errorMessage.includes('disconnected') ||
          errorMessage.includes('not connected') ||
          errorMessage.includes('session closed') ||
          errorMessage.includes('websocket')) {
        isSessionError = true;
        errorType = 'connection';
        canRetry = false;
      }
      // Check for rate limiting
      else if (errorMessage.includes('rate limit') ||
               errorMessage.includes('too many requests') ||
               errorMessage.includes('flood')) {
        isSessionError = false;
        errorType = 'rate_limit';
        canRetry = true;
      }
      // Check for banned/blocked numbers
      else if (errorMessage.includes('banned') ||
               errorMessage.includes('blocked') ||
               errorMessage.includes('not allowed') ||
               errorMessage.includes('recipient unavailable')) {
        isSessionError = false;
        errorType = 'banned_number';
        canRetry = false;
      }
      // Check for invalid number format
      else if (errorMessage.includes('invalid') ||
               errorMessage.includes('malformed') ||
               errorMessage.includes('bad request')) {
        isSessionError = false;
        errorType = 'invalid_number';
        canRetry = false;
      }
      // Check for session banned
      else if (errorMessage.includes('banned') ||
               errorMessage.includes('suspended') ||
               errorMessage.includes('account restricted')) {
        isSessionError = true;
        errorType = 'session_banned';
        canRetry = false;
      }

      return {
        success: false,
        error: error.message,
        isSessionError,
        errorType,
        canRetry
      };

    }
  }

  /**
   * Check session health before starting blast execution
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object>} - Health check result
   */
  async checkSessionHealth(sessionId) {
    try {
      const session = await BlastSession.findOne({ where: { sessionId } });
      if (!session) {
        return { healthy: false, reason: 'Session not found' };
      }

      // Check if session is in error state
      if (session.status === 'ERROR' || session.status === 'BANNED') {
        return {
          healthy: false,
          reason: `Session status: ${session.status}`,
          errorCode: session.errorCode
        };
      }

      // Get WhatsApp socket
      const sock = getSock(session.whatsappSessionId);
      if (!sock) {
        return { healthy: false, reason: 'WhatsApp socket not available' };
      }

      // Check connection state
      if (!sock.user || !sock.user.id) {
        return { healthy: false, reason: 'WhatsApp user not authenticated' };
      }

      // Check if WebSocket is connected (warning but allow for blast sessions)
      if (!sock.ws) {
        logger.warn(`⚠️ WebSocket not initialized for session ${sessionId} - blast may work with stored data`);
      } else {
        const readyState = sock.ws.readyState;
        if (readyState !== 1) {
          const stateNames = {
            0: 'CONNECTING',
            1: 'OPEN',
            2: 'CLOSING',
            3: 'CLOSED'
          };
          const stateName = stateNames[readyState] || `UNKNOWN(${readyState})`;
          logger.warn(`⚠️ WebSocket ${stateName} for session ${sessionId} - blast may work with stored data`);
        }
      }

      // Try a simple operation to test session health
      try {
        // Test by checking if we can access store (warning only for blast sessions)
        if (!sock.store) {
          logger.warn(`⚠️ Session store not available for ${sessionId} - blast may still work`);
        }
      } catch (stateError) {
        logger.warn(`⚠️ Session health check warning for ${sessionId}:`, stateError.message);
        // Don't fail the health check for store access issues
      }

      return { healthy: true };
    } catch (error) {
      logger.error(`❌ Error checking session health for ${sessionId}:`, error);
      return { healthy: false, reason: `Health check error: ${error.message}` };
    }
  }

  /**
   * Monitor session health during execution
   * @param {string} sessionId - Session ID
   * @param {Object} executionState - Current execution state
   */
  async monitorSessionHealth(sessionId, executionState) {
    try {
      const healthCheck = await this.checkSessionHealth(sessionId);

      if (!healthCheck.healthy) {
        logger.warn(`🚨 Session health issue detected for ${sessionId}: ${healthCheck.reason}`);

        // Stop execution if session is unhealthy
        executionState.isStopped = true;
        executionState.stopReason = 'session_unhealthy';

        // Update database
        await BlastSession.update(
          {
            status: 'ERROR',
            errorMessage: `Session unhealthy: ${healthCheck.reason}`,
            errorCode: healthCheck.errorCode || 'SESSION_UNHEALTHY',
            stoppedAt: new Date()
          },
          { where: { sessionId } }
        );

        // Emit notification
        _emitToastNotification(
          "error",
          "Session Health Issue",
          `Blast stopped due to session health issue: ${healthCheck.reason}`,
          sessionId
        );

        return false; // Unhealthy
      }

      return true; // Healthy
    } catch (error) {
      logger.error(`❌ Error monitoring session health for ${sessionId}:`, error);
      return false; // Assume unhealthy on error
    }
  }

  /**
   * Check if current time is within business hours
   * @param {Object} businessHoursConfig - Business hours configuration
   * @returns {boolean} - True if within business hours, false otherwise
   */
  isWithinBusinessHours(businessHoursConfig) {
    try {
      if (!businessHoursConfig || !businessHoursConfig.enabled) {
        return true; // If not enabled or not configured, always allow
      }

      // Validate required properties
      if (typeof businessHoursConfig.startHour !== 'number' ||
          typeof businessHoursConfig.endHour !== 'number') {
        logger.warn('Invalid business hours config: missing startHour or endHour');
        return true; // Allow if config is invalid
      }

      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const currentTime = currentHour * 60 + currentMinute; // Convert to minutes since midnight

      // Check if weekend and weekends are excluded
      if (businessHoursConfig.excludeWeekends) {
        const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          return false; // Outside business hours on weekends
        }
      }

      // Convert business hours to minutes since midnight
      const startTime = businessHoursConfig.startHour * 60;
      const endTime = businessHoursConfig.endHour * 60;

      // Check if within business hours
      let isWithinHours = currentTime >= startTime && currentTime <= endTime;

      // If lunch break is excluded, check if current time is within lunch break
      if (businessHoursConfig.excludeLunchBreak && isWithinHours) {
        if (typeof businessHoursConfig.lunchStart === 'number' &&
            typeof businessHoursConfig.lunchEnd === 'number') {
          const lunchStart = businessHoursConfig.lunchStart * 60;
          const lunchEnd = businessHoursConfig.lunchEnd * 60;
          const isWithinLunch = currentTime >= lunchStart && currentTime <= lunchEnd;
          if (isWithinLunch) {
            return false; // Outside business hours during lunch break
          }
        }
      }

      return isWithinHours;
    } catch (error) {
      logger.error('Error in isWithinBusinessHours:', error);
      return true; // Allow on error to prevent blocking
    }
  }

  /**
   * Get the next business hours start time
   * @param {Object} businessHoursConfig - Business hours configuration
   * @returns {Date} - Next business hours start time
   */
  getNextBusinessHoursStart(businessHoursConfig) {
    if (!businessHoursConfig || !businessHoursConfig.enabled) {
      return new Date(); // Return current time if not enabled
    }

    const now = new Date();
    let nextStart = new Date(now);

    // If weekends are excluded, find next weekday
    if (businessHoursConfig.excludeWeekends) {
      let dayOfWeek = now.getDay();
      if (dayOfWeek === 0) { // Sunday
        nextStart.setDate(now.getDate() + 1); // Monday
      } else if (dayOfWeek === 6) { // Saturday
        nextStart.setDate(now.getDate() + 2); // Monday
      }
      nextStart.setHours(businessHoursConfig.startHour, 0, 0, 0);
    } else {
      // Same day or next day
      nextStart.setHours(businessHoursConfig.startHour, 0, 0, 0);
      if (nextStart <= now) {
        nextStart.setDate(now.getDate() + 1);
      }
    }

    return nextStart;
  }

  /**
   * Schedule a check for business hours resumption
   * @param {string} sessionId - Session ID
   * @param {Object} businessHoursConfig - Business hours configuration
   */
  scheduleBusinessHoursCheck(sessionId, businessHoursConfig) {
    const nextStart = this.getNextBusinessHoursStart(businessHoursConfig);
    const timeUntilNext = nextStart.getTime() - Date.now();

    if (timeUntilNext > 0) {
      setTimeout(async () => {
        try {
          // Check if we're now within business hours
          if (this.isWithinBusinessHours(businessHoursConfig)) {
            logger.info(`⏰ Auto-resuming session ${sessionId} as business hours have started`);
            await this.resumeSession(sessionId);
          } else {
            // Schedule another check
            this.scheduleBusinessHoursCheck(sessionId, businessHoursConfig);
          }
        } catch (error) {
          logger.error(`❌ Error in business hours check for session ${sessionId}:`, error);
        }
      }, Math.min(timeUntilNext, 60 * 60 * 1000)); // Check at most every hour
    }
  }

  /**
   * Start range management delays for a session
   * @param {string} sessionId - Session ID
   * @param {Object} executionState - Current execution state
   */
  async applyRangeDelays(sessionId, executionState) {
    try {
      const session = await BlastSession.findOne({ where: { sessionId } });
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      const { config } = session;
      if (!config || !config.messageRange) {
        return; // No range management configured
      }

      const { messageRange } = config;

      // Calculate delay based on message index and total messages
      const totalMessages = executionState.processedCount + 1; // Include current message
      const delayConfig = messageRange.find(range => {
        return totalMessages >= range.startIndex && totalMessages <= range.endIndex;
      });

      if (delayConfig) {
        const { delay } = delayConfig;

        // Apply exponential backoff for retries
        let retryCount = 0;
        let appliedDelay = delay;

        while (retryCount < 5) {
          try {
            logger.info(`⏳ Applying delay of ${appliedDelay}ms for session ${sessionId}`);
            await this.sleep(appliedDelay);

            // Check if still within the same range
            const currentMessage = await messageQueueHandler.getMessageByIndex(sessionId, totalMessages);
            if (!currentMessage || currentMessage.status !== 'PENDING') {
              logger.info(`✅ Message ${totalMessages} is no longer pending, resuming normal flow`);
              return; // Message is no longer pending, exit delay
            }

            // Double the delay for next retry
            retryCount++;
            appliedDelay *= 2;
          } catch (error) {
            logger.error(`❌ Error in delay handling for session ${sessionId}:`, error);
            break; // Exit on error
          }
        }
      }
    } catch (error) {
      logger.error(`❌ Error in applyRangeDelays for ${sessionId}:`, error);
    }
  }

  /**
   * Pause blast execution
   * @param {string} sessionId - Session ID to pause
   * @returns {Promise<Object>} - Pause result
   */
  async pauseExecution(sessionId) {
    try {
      const executionState = this.runningExecutions.get(sessionId);
      if (!executionState) {
        logger.warn(`⚠️ No active execution found for session ${sessionId} to pause`);
        return { success: false, message: "No active execution found" };
      }

      executionState.isPaused = true;
      executionState.pausedAt = new Date();

      logger.info(`⏸️ Blast execution paused for session: ${sessionId}`);

      // Emit UI update
      _emitSessionsUpdate(sessionId);

      return {
        success: true,
        sessionId,
        message: "Execution paused successfully",
      };
    } catch (error) {
      logger.error(`❌ Failed to pause execution for ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Resume blast execution
   * @param {string} sessionId - Session ID to resume
   * @returns {Promise<Object>} - Resume result
   */
  async resumeExecution(sessionId) {
    try {
      const executionState = this.runningExecutions.get(sessionId);
      if (!executionState) {
        logger.warn(`⚠️ No execution state found for session ${sessionId} to resume`);
        return { success: false, message: "No execution state found" };
      }

      executionState.isPaused = false;
      executionState.resumedAt = new Date();

      logger.info(`▶️ Blast execution resumed for session: ${sessionId}`);

      // Emit UI update
      _emitSessionsUpdate(sessionId);

      return {
        success: true,
        sessionId,
        message: "Execution resumed successfully",
      };
    } catch (error) {
      logger.error(`❌ Failed to resume execution for ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Stop blast execution
   * @param {string} sessionId - Session ID to stop
   * @returns {Promise<Object>} - Stop result
   */
  async stopExecution(sessionId) {
    try {
      const executionState = this.runningExecutions.get(sessionId);
      if (!executionState) {
        logger.warn(`⚠️ No active execution found for session ${sessionId} to stop`);
        return { success: false, message: "No active execution found" };
      }

      executionState.isStopped = true;
      executionState.stoppedAt = new Date();

      // Remove from running executions
      this.runningExecutions.delete(sessionId);

      logger.info(`⏹️ Blast execution stopped for session: ${sessionId}`);

      // Emit UI update
      _emitSessionsUpdate(sessionId);

      return {
        success: true,
        sessionId,
        message: "Execution stopped successfully",
      };
    } catch (error) {
      logger.error(`❌ Failed to stop execution for ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Sleep utility
   * @param {number} ms - Milliseconds to sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Handle execution errors
   */
  async handleExecutionError(sessionId, error) {
    try {
      logger.error(`💥 Handling execution error for session ${sessionId}:`, error);

      // Get execution state
      const executionState = this.runningExecutions.get(sessionId);
      if (!executionState) {
        logger.warn(`⚠️ No execution state found for session ${sessionId} during error handling`);
        return;
      }

      // Mark execution as stopped due to error
      executionState.isStopped = true;
      executionState.stopReason = 'execution_error';
      executionState.error = error.message;

      // Update session status in database
      const BlastSession = require('../models/blastSessionModel');
      await BlastSession.update(
        {
          status: 'FAILED',
          completedAt: new Date()
        },
        {
          where: { sessionId }
        }
      );

      // Clean up execution state
      this.runningExecutions.delete(sessionId);

      // Emit error notification
      _emitToastNotification(
        "error",
        "Blast Gagal",
        `Campaign gagal karena error: ${error.message}`,
        sessionId
      );

      // Emit final session update
      _emitSessionsUpdate(sessionId);

      logger.error(`❌ Execution stopped for session ${sessionId} due to error: ${error.message}`);

    } catch (handleError) {
      logger.error(`❌ Failed to handle execution error for session ${sessionId}:`, handleError);
      // Don't throw to avoid recursive errors
    }
  }

  /**
   * Complete successful execution
   */
  async completeExecution(sessionId) {
    try {
      logger.info(`🎉 Completing successful execution for session ${sessionId}`);

      // Get execution state
      const executionState = this.runningExecutions.get(sessionId);
      if (!executionState) {
        logger.warn(`⚠️ No execution state found for session ${sessionId} during completion`);
        return;
      }

      // Mark execution as completed
      executionState.isStopped = true;
      executionState.stopReason = 'completed';

      // Update session status in database
      const BlastSession = require('../models/blastSessionModel');
      await BlastSession.update(
        {
          status: 'COMPLETED',
          completedAt: new Date(),
          progressPercentage: 100.0
        },
        {
          where: { sessionId }
        }
      );

      // Clean up execution state
      this.runningExecutions.delete(sessionId);

      // Emit success notification
      _emitToastNotification(
        "success",
        "Blast Selesai",
        `Campaign telah selesai dengan sukses`,
        sessionId
      );

      // Emit final session update
      _emitSessionsUpdate(sessionId);

      logger.info(`✅ Execution completed successfully for session ${sessionId}`);

    } catch (error) {
      logger.error(`❌ Failed to complete execution for session ${sessionId}:`, error);
      // Fallback to error handling
      await this.handleExecutionError(sessionId, error);
    }
  }

  /**
   * Update session progress in database
   */
  async updateSessionProgress(sessionId, executionState) {
    try {
      const BlastSession = require('../models/blastSessionModel');

      // Calculate progress percentage
      const totalMessages = executionState.totalMessages || 1; // Avoid division by zero
      const progressPercentage = totalMessages > 0
        ? Math.min((executionState.processedCount / totalMessages) * 100, 100)
        : 0;

      // Update session in database
      await BlastSession.update(
        {
          currentIndex: executionState.currentIndex || 0,
          sentCount: executionState.successCount || 0,
          failedCount: executionState.failedCount || 0,
          skippedCount: executionState.skippedCount || 0,
          progressPercentage: progressPercentage.toFixed(2)
        },
        {
          where: { sessionId }
        }
      );

      logger.debug(`📊 Session progress updated: ${sessionId} - ${progressPercentage.toFixed(2)}%`);

    } catch (error) {
      logger.error(`❌ Failed to update session progress for ${sessionId}:`, error);
      // Don't throw error to avoid breaking the execution flow
    }
  }
}

module.exports = {
  _emitSessionsUpdate,
  _emitToastNotification,
  BlastExecutionService,
  checkSessionHealth: BlastExecutionService.prototype.checkSessionHealth,
  monitorSessionHealth: BlastExecutionService.prototype.monitorSessionHealth,
  isWithinBusinessHours: BlastExecutionService.prototype.isWithinBusinessHours,
  getNextBusinessHoursStart: BlastExecutionService.prototype.getNextBusinessHoursStart,
  scheduleBusinessHoursCheck: BlastExecutionService.prototype.scheduleBusinessHoursCheck,
  resumeSession: BlastExecutionService.prototype.resumeSession,
  pauseExecution: BlastExecutionService.prototype.pauseExecution,
  resumeExecution: BlastExecutionService.prototype.resumeExecution,
  stopExecution: BlastExecutionService.prototype.stopExecution,
  updateSessionProgress: BlastExecutionService.prototype.updateSessionProgress,
  handleExecutionError: BlastExecutionService.prototype.handleExecutionError,
  completeExecution: BlastExecutionService.prototype.completeExecution
};