const logger = require("../utils/logger");
const { getSocket } = require("../auth/socket");
const { getSock } = require("../auth/session");
const blastSessionManager = require("../utils/blastSessionManager");
const messageQueueHandler = require("../utils/messageQueueHandler");
const BlastSession = require("../models/blastSessionModel");
const BlastMessage = require("../models/blastMessageModel");
const SpinTextEngine = require("../utils/spinTextEngine");
const BlastRealTimeService = require("./blastRealTimeService");
const blastRealTimeService = new BlastRealTimeService(); 
const _emitSessionsUpdate = async (sessionId = null) => {
  try {
    if (sessionId) {
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
          const transformedSessions = userSessions.map(session => {
            const sessionData = session.toJSON();
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
          const transformedSessions = userSessions.map(session => {
            const sessionData = session.toJSON();
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
const _emitToastNotification = (type, title, description, sessionId = null, userId = null) => {
  try {
    blastRealTimeService.emitToastNotification(type, title, description, userId, sessionId);
  } catch (error) {
    logger.error("❌ Failed to emit toast notification via real-time service:", error);
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
const _emitProgressUpdate = async (sessionId, executionState, userId) => {
  try {
    const socket = getSocket();
    if (!socket) {
      logger.warn("⚠️ Socket not available for progress update");
      return;
    }
    const totalMessages = executionState.totalMessages || 1;
    const progressPercentage = totalMessages > 0
      ? Math.min((executionState.processedCount / totalMessages) * 100, 100)
      : 0;
    const progressData = {
      sessionId,
      sentCount: executionState.successCount || 0,
      failedCount: executionState.failedCount || 0,
      skippedCount: executionState.skippedCount || 0,
      totalMessages: executionState.totalMessages || 0,
      processedCount: executionState.processedCount || 0,
      currentIndex: executionState.currentIndex || 0,
      progressPercentage: progressPercentage.toFixed(2),
      remainingCount: totalMessages - (executionState.processedCount || 0),
      timestamp: new Date().toISOString()
    };
    socket.to(`user_${userId}`).emit("session-progress-update", progressData);
    logger.debug(`⚡ Real-time progress emitted from memory: ${sessionId} - ${progressPercentage.toFixed(2)}%`);
  } catch (error) {
    logger.error(`❌ Failed to emit real-time progress for ${sessionId}:`, error);
  }
};
const runningExecutions = new Map(); 
const businessHoursTimers = new Map(); 
class BlastExecutionService {
  constructor() {
    this.runningExecutions = runningExecutions; 
    this.businessHoursTimers = businessHoursTimers; 
    this.healthCheckCache = new Map(); 
    this.HEALTH_CACHE_TTL = 5 * 60 * 1000; 
  }
  randomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min) * 1000;
  }
  async initializeAutoResumeScheduler() {
    try {
      if (!BlastSession || typeof BlastSession.findAll !== 'function') {
        logger.warn('⚠️ BlastSession model not available for auto-resume scheduler initialization');
        return;
      }
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
    }
  }  
  async startExecution(sessionId, forceStart = false) {
    try {
      if (!this.autoResumeInitialized) {
        this.autoResumeInitialized = true;
        this.initializeAutoResumeScheduler().catch(error => {
          logger.warn('⚠️ Auto-resume scheduler initialization failed:', error.message);
        });
      }
      logger.info(
        `🚀 Starting blast execution for session: ${sessionId}${
          forceStart ? " (FORCED)" : ""
        }`
      );
      const session = await BlastSession.findOne({ where: { sessionId } });
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }
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
          this.runningExecutions.delete(sessionId);
        } else {
          throw new Error(`Session ${sessionId} is already running`);
        }
      }
      const sock = getSock(session.whatsappSessionId);
      if (!sock) {
        throw new Error(
          `WhatsApp session ${session.whatsappSessionId} not found or not active`
        );
      }
      await session.update({
        status: "RUNNING",
        startedAt: new Date(),
      });
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
        lastDBUpdate: 0, 
        lastSocketEmit: Date.now(), 
      };
      this.runningExecutions.set(sessionId, executionState);
      _emitSessionsUpdate(sessionId);
      _emitToastNotification(
        "success",
        "Campaign Dimulai",
        `Campaign ${session.campaignName || sessionId} telah dimulai`,
        sessionId
      );
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
  async processMessages(sessionId, sock) {
    const executionState = this.runningExecutions.get(sessionId);
    if (!executionState) {
      logger.warn(`⚠️ Execution state not found for session ${sessionId}`);
      return;
    }
    try {
      const session = await BlastSession.findOne({ where: { sessionId } });
      const fullConfig = blastSessionManager.applyRuntimeConfig(session.config);
      const businessHoursConfig = fullConfig.businessHours || {};
      while (!executionState.isStopped) {
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
        if (executionState.isPaused) {
          logger.info(`⏸️ Session ${sessionId} is paused, waiting...`);
          await this.sleep(5000); 
          continue;
        }
        const messages = await messageQueueHandler.getNextBatch(sessionId, 1);
        if (messages.length === 0) {
          const queueStats = await messageQueueHandler.getQueueStats(sessionId);
          if (queueStats.remaining > 0) {
            logger.info(
              `⏳ Session ${sessionId} has ${queueStats.remaining} remaining messages (${queueStats.pending} pending, ${queueStats.processing} processing). Waiting...`
            );
            await this.sleep(5000);
            continue;
          }
          logger.info(
            `✅ All messages processed for session ${sessionId}. Final stats: ${queueStats.sent} sent, ${queueStats.failed} failed, ${queueStats.skipped} skipped`
          );
          await this.completeExecution(sessionId);
          break;
        }
        const message = messages[0];
        try {
          await messageQueueHandler.markAsProcessing(message.id);
          const isFirstMessage = executionState.processedCount === 0;
          if (isFirstMessage) {
            logger.info(`🚀 First message - sending immediately without delays!`);
          } else {
          }
          const result = await this.sendMessage(sock, message);
          if (result.success) {
            await messageQueueHandler.markAsSent(message.id, result.messageId);
            executionState.successCount++;
            executionState.lastMessageSentAt = new Date();
            executionState.lastMessagePhone = message.phone;
            executionState.lastMessageContact = message.contactName || message.phone;
            logger.info(`✅ Message sent successfully: ${message.phone}`);
          } else {
            await this.handleSendError(sessionId, result, executionState);
            if (result.isSessionError) {
              logger.error(`🚫 Session error detected, stopping execution: ${result.errorType}`);
              executionState.isStopped = true;
              executionState.stopReason = result.errorType;
              await messageQueueHandler.markAsFailed(message.id, result.error);
              executionState.failedCount++;
              break;
            }
            await messageQueueHandler.markAsFailed(message.id, result.error);
            executionState.failedCount++;
            logger.warn(
              `⚠️ Message failed: ${message.phone} - ${result.error}`
            );
          }
          executionState.processedCount++;
          executionState.currentIndex = message.messageIndex;
          _emitProgressUpdate(sessionId, executionState, session.userId);
          const messagesSinceLastUpdate = executionState.processedCount - executionState.lastDBUpdate;
          const timeSinceLastUpdate = Date.now() - executionState.lastDBUpdate;
          const shouldUpdateDB = messagesSinceLastUpdate >= 10 || 
                                executionState.processedCount === 1 ||
                                timeSinceLastUpdate >= 10000; 
          if (shouldUpdateDB) {
            await this.updateSessionProgress(sessionId, executionState);
            executionState.lastDBUpdate = executionState.processedCount;
            logger.debug(`💾 DB persisted at message ${executionState.processedCount} (${((executionState.processedCount / executionState.totalMessages) * 100).toFixed(1)}%)`);
          }
          const timeSinceLastFullEmit = Date.now() - executionState.lastSocketEmit;
          if (timeSinceLastFullEmit >= 30000 || executionState.processedCount === 1) {
            setImmediate(async () => {
              try {
                await _emitSessionsUpdate(sessionId);
                logger.debug(`📡 Full sessions-update emitted at message ${executionState.processedCount}`);
              } catch (err) {
                logger.warn(`⚠️ Failed to emit full sessions update:`, err);
              }
            });
            executionState.lastSocketEmit = Date.now();
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
        const contactDelayConfig = fullConfig.contactDelay;
        const queueStatsAfterSend = await messageQueueHandler.getQueueStats(sessionId);
        const isLastMessage = queueStatsAfterSend.remaining === 0;
        if (isLastMessage) {
          logger.info(`🎉 Last message sent successfully! Skipping contact delay and completing session...`);
        } else if (contactDelayConfig && contactDelayConfig.min && contactDelayConfig.max) {
          const randomDelay = this.randomDelay(contactDelayConfig.min, contactDelayConfig.max);
          executionState.nextContactDelay = randomDelay;
          executionState.nextContactDelayEndsAt = new Date(Date.now() + randomDelay);
          logger.info(`⏳ Applying contact delay: ${(randomDelay / 1000).toFixed(1)}s (range: ${contactDelayConfig.min}s-${contactDelayConfig.max}s)`);
          await this.sleep(randomDelay);
          executionState.nextContactDelay = null;
          executionState.nextContactDelayEndsAt = null;
        }
        if (isLastMessage) {
          logger.info(`✅ Skipping rest period and daily limit checks - campaign completing...`);
          continue; 
        }
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
  async sendMessage(sock, message) {
    try {
      const messageText = message.finalMessage || message.messageTemplate;
      if (!messageText) {
        throw new Error('No message content available');
      }
      const messageContent = { text: messageText };
      const result = await sock.sendMessage(message.phone + '@s.whatsapp.net', messageContent);
      return {
        success: true,
        messageId: result.key.id,
        timestamp: result.messageTimestamp
      };
    } catch (error) {
      logger.error(`❌ Failed to send message to ${message.phone}:`, error);
      let isSessionError = false;
      let errorType = 'unknown';
      let canRetry = true;
      const errorMessage = error.message.toLowerCase();
      if (errorMessage.includes('connection') ||
          errorMessage.includes('disconnected') ||
          errorMessage.includes('not connected') ||
          errorMessage.includes('session closed') ||
          errorMessage.includes('websocket')) {
        isSessionError = true;
        errorType = 'connection';
        canRetry = false;
      }
      else if (errorMessage.includes('rate limit') ||
               errorMessage.includes('too many requests') ||
               errorMessage.includes('flood')) {
        isSessionError = false;
        errorType = 'rate_limit';
        canRetry = true;
      }
      else if (errorMessage.includes('not registered') ||
               errorMessage.includes('not on whatsapp') ||
               errorMessage.includes('phone not found') ||
               errorMessage.includes('recipient not found') ||
               errorMessage.includes('number not registered')) {
        isSessionError = false;
        errorType = 'phone_not_registered';
        canRetry = false;
        logger.info(`📱 Phone not registered on WhatsApp detected via send attempt`);
      }
      else if (errorMessage.includes('banned') ||
               errorMessage.includes('blocked') ||
               errorMessage.includes('not allowed') ||
               errorMessage.includes('recipient unavailable')) {
        isSessionError = false;
        errorType = 'banned_number';
        canRetry = false;
      }
      else if (errorMessage.includes('invalid') ||
               errorMessage.includes('malformed') ||
               errorMessage.includes('bad request')) {
        isSessionError = false;
        errorType = 'invalid_number';
        canRetry = false;
      }
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
  async checkSessionHealth(sessionId, forceRefresh = false) {
    try {
      if (!forceRefresh && this.healthCheckCache.has(sessionId)) {
        const cached = this.healthCheckCache.get(sessionId);
        const age = Date.now() - cached.timestamp;
        if (age < this.HEALTH_CACHE_TTL) {
          logger.debug(`💾 Using cached health check for ${sessionId} (age: ${Math.floor(age/1000)}s)`);
          return cached.result;
        } else {
          logger.debug(`⏰ Health check cache expired for ${sessionId} (age: ${Math.floor(age/1000)}s)`);
          this.healthCheckCache.delete(sessionId);
        }
      }
      logger.debug(`🔍 Performing fresh health check for ${sessionId}${forceRefresh ? ' (forced)' : ''}`);
      const session = await BlastSession.findOne({ where: { sessionId } });
      if (!session) {
        const result = { healthy: false, reason: 'Session not found' };
        return result;
      }
      if (session.status === 'ERROR' || session.status === 'BANNED') {
        const result = {
          healthy: false,
          reason: `Session status: ${session.status}`,
          errorCode: session.errorCode
        };
        return result;
      }
      const sock = getSock(session.whatsappSessionId);
      if (!sock) {
        const result = { healthy: false, reason: 'WhatsApp socket not available' };
        return result;
      }
      if (!sock.user || !sock.user.id) {
        return { healthy: false, reason: 'WhatsApp user not authenticated' };
      }
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
      try {
        if (!sock.store) {
          logger.warn(`⚠️ Session store not available for ${sessionId} - blast may still work`);
        }
      } catch (stateError) {
        logger.warn(`⚠️ Session health check warning for ${sessionId}:`, stateError.message);
      }
      const result = { healthy: true };
      this.healthCheckCache.set(sessionId, {
        result,
        timestamp: Date.now(),
        sock 
      });
      logger.debug(`💾 Cached health check result for ${sessionId}`);
      return result;
    } catch (error) {
      logger.error(`❌ Error checking session health for ${sessionId}:`, error);
      const result = { healthy: false, reason: `Health check error: ${error.message}` };
      return result;
    }
  }
  invalidateHealthCache(sessionId) {
    if (this.healthCheckCache.has(sessionId)) {
      this.healthCheckCache.delete(sessionId);
      logger.debug(`🗑️ Invalidated health check cache for ${sessionId}`);
    }
  }
  async handleSendError(sessionId, result, executionState) {
    if (result.errorType === 'connection' || result.errorType === 'session_banned') {
      logger.warn(`🔄 Connection error detected for ${sessionId}, invalidating health cache`);
      this.invalidateHealthCache(sessionId);
      const healthCheck = await this.checkSessionHealth(sessionId, true);
      if (!healthCheck.healthy) {
        logger.error(`❌ Fresh health check failed: ${healthCheck.reason}`);
        executionState.isStopped = true;
        executionState.stopReason = 'unhealthy_after_error';
      }
    }
  }
  async monitorSessionHealth(sessionId, executionState) {
    try {
      const healthCheck = await this.checkSessionHealth(sessionId);
      if (!healthCheck.healthy) {
        logger.warn(`🚨 Session health issue detected for ${sessionId}: ${healthCheck.reason}`);
        executionState.isStopped = true;
        executionState.stopReason = 'session_unhealthy';
        await BlastSession.update(
          {
            status: 'ERROR',
            errorMessage: `Session unhealthy: ${healthCheck.reason}`,
            errorCode: healthCheck.errorCode || 'SESSION_UNHEALTHY',
            stoppedAt: new Date()
          },
          { where: { sessionId } }
        );
        _emitToastNotification(
          "error",
          "Session Health Issue",
          `Blast stopped due to session health issue: ${healthCheck.reason}`,
          sessionId
        );
        return false; 
      }
      return true; 
    } catch (error) {
      logger.error(`❌ Error monitoring session health for ${sessionId}:`, error);
      return false; 
    }
  }
  isWithinBusinessHours(businessHoursConfig) {
    try {
      if (!businessHoursConfig || !businessHoursConfig.enabled) {
        return true; 
      }
      if (typeof businessHoursConfig.startHour !== 'number' ||
          typeof businessHoursConfig.endHour !== 'number') {
        logger.warn('Invalid business hours config: missing startHour or endHour');
        return true; 
      }
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const currentTime = currentHour * 60 + currentMinute; 
      if (businessHoursConfig.excludeWeekends) {
        const dayOfWeek = now.getDay(); 
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          return false; 
        }
      }
      const startTime = businessHoursConfig.startHour * 60;
      const endTime = businessHoursConfig.endHour * 60;
      let isWithinHours = currentTime >= startTime && currentTime <= endTime;
      if (businessHoursConfig.excludeLunchBreak && isWithinHours) {
        if (typeof businessHoursConfig.lunchStart === 'number' &&
            typeof businessHoursConfig.lunchEnd === 'number') {
          const lunchStart = businessHoursConfig.lunchStart * 60;
          const lunchEnd = businessHoursConfig.lunchEnd * 60;
          const isWithinLunch = currentTime >= lunchStart && currentTime <= lunchEnd;
          if (isWithinLunch) {
            return false; 
          }
        }
      }
      return isWithinHours;
    } catch (error) {
      logger.error('Error in isWithinBusinessHours:', error);
      return true; 
    }
  }
  getNextBusinessHoursStart(businessHoursConfig) {
    if (!businessHoursConfig || !businessHoursConfig.enabled) {
      return new Date(); 
    }
    const now = new Date();
    let nextStart = new Date(now);
    if (businessHoursConfig.excludeWeekends) {
      let dayOfWeek = now.getDay();
      if (dayOfWeek === 0) { 
        nextStart.setDate(now.getDate() + 1); 
      } else if (dayOfWeek === 6) { 
        nextStart.setDate(now.getDate() + 2); 
      }
      nextStart.setHours(businessHoursConfig.startHour, 0, 0, 0);
    } else {
      nextStart.setHours(businessHoursConfig.startHour, 0, 0, 0);
      if (nextStart <= now) {
        nextStart.setDate(now.getDate() + 1);
      }
    }
    return nextStart;
  }
  scheduleBusinessHoursCheck(sessionId, businessHoursConfig) {
    const nextStart = this.getNextBusinessHoursStart(businessHoursConfig);
    const timeUntilNext = nextStart.getTime() - Date.now();
    if (timeUntilNext > 0) {
      setTimeout(async () => {
        try {
          if (this.isWithinBusinessHours(businessHoursConfig)) {
            logger.info(`⏰ Auto-resuming session ${sessionId} as business hours have started`);
            await this.resumeSession(sessionId);
          } else {
            this.scheduleBusinessHoursCheck(sessionId, businessHoursConfig);
          }
        } catch (error) {
          logger.error(`❌ Error in business hours check for session ${sessionId}:`, error);
        }
      }, Math.min(timeUntilNext, 60 * 60 * 1000)); 
    }
  }
  async applyRangeDelays(sessionId, executionState) {
    try {
      const session = await BlastSession.findOne({ where: { sessionId } });
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }
      const { config } = session;
      if (!config || !config.messageRange) {
        return; 
      }
      const { messageRange } = config;
      const totalMessages = executionState.processedCount + 1; 
      const delayConfig = messageRange.find(range => {
        return totalMessages >= range.startIndex && totalMessages <= range.endIndex;
      });
      if (delayConfig) {
        const { delay } = delayConfig;
        let retryCount = 0;
        let appliedDelay = delay;
        while (retryCount < 5) {
          try {
            logger.info(`⏳ Applying delay of ${appliedDelay}ms for session ${sessionId}`);
            await this.sleep(appliedDelay);
            const currentMessage = await messageQueueHandler.getMessageByIndex(sessionId, totalMessages);
            if (!currentMessage || currentMessage.status !== 'PENDING') {
              logger.info(`✅ Message ${totalMessages} is no longer pending, resuming normal flow`);
              return; 
            }
            retryCount++;
            appliedDelay *= 2;
          } catch (error) {
            logger.error(`❌ Error in delay handling for session ${sessionId}:`, error);
            break; 
          }
        }
      }
    } catch (error) {
      logger.error(`❌ Error in applyRangeDelays for ${sessionId}:`, error);
    }
  }
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
  async stopExecution(sessionId) {
    try {
      const executionState = this.runningExecutions.get(sessionId);
      if (!executionState) {
        logger.warn(`⚠️ No active execution found for session ${sessionId} to stop`);
        return { success: false, message: "No active execution found" };
      }
      executionState.isStopped = true;
      executionState.stoppedAt = new Date();
      this.invalidateHealthCache(sessionId);
      this.runningExecutions.delete(sessionId);
      logger.info(`⏹️ Blast execution stopped for session: ${sessionId}`);
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
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  async handleExecutionError(sessionId, error) {
    try {
      logger.error(`💥 Handling execution error for session ${sessionId}:`, error);
      const executionState = this.runningExecutions.get(sessionId);
      if (!executionState) {
        logger.warn(`⚠️ No execution state found for session ${sessionId} during error handling`);
        return;
      }
      executionState.isStopped = true;
      executionState.stopReason = 'execution_error';
      executionState.error = error.message;
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
      this.runningExecutions.delete(sessionId);
      _emitToastNotification(
        "error",
        "Blast Gagal",
        `Campaign gagal karena error: ${error.message}`,
        sessionId
      );
      _emitSessionsUpdate(sessionId);
      logger.error(`❌ Execution stopped for session ${sessionId} due to error: ${error.message}`);
    } catch (handleError) {
      logger.error(`❌ Failed to handle execution error for session ${sessionId}:`, handleError);
    }
  }
  async completeExecution(sessionId) {
    try {
      logger.info(`🎉 Completing successful execution for session ${sessionId}`);
      const executionState = this.runningExecutions.get(sessionId);
      if (!executionState) {
        logger.warn(`⚠️ No execution state found for session ${sessionId} during completion`);
        return;
      }
      executionState.isStopped = true;
      executionState.stopReason = 'completed';
      await this.updateSessionProgress(sessionId, executionState, true); 
      logger.debug(`💾 Final batch DB update for session ${sessionId}`);
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
      this.invalidateHealthCache(sessionId);
      this.runningExecutions.delete(sessionId);
      _emitToastNotification(
        "success",
        "Blast Selesai",
        `Campaign telah selesai dengan sukses`,
        sessionId
      );
      _emitSessionsUpdate(sessionId);
      logger.debug(`📡 Final socket emission for session ${sessionId}`);
      logger.info(`✅ Execution completed successfully for session ${sessionId}`);
    } catch (error) {
      logger.error(`❌ Failed to complete execution for session ${sessionId}:`, error);
      await this.handleExecutionError(sessionId, error);
    }
  }
  async updateSessionProgress(sessionId, executionState, forceEmit = false) {
    try {
      const BlastSession = require('../models/blastSessionModel');
      const totalMessages = executionState.totalMessages || 1; 
      const progressPercentage = totalMessages > 0
        ? Math.min((executionState.processedCount / totalMessages) * 100, 100)
        : 0;
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
      logger.debug(`📊 Session progress updated: ${sessionId} - ${progressPercentage.toFixed(2)}% (sent: ${executionState.successCount}, failed: ${executionState.failedCount}, skipped: ${executionState.skippedCount})`);
      if (forceEmit) {
        setImmediate(async () => {
          try {
            await _emitSessionsUpdate(sessionId);
            logger.debug(`📡 Force socket emit for ${sessionId} at ${progressPercentage.toFixed(2)}%`);
          } catch (socketError) {
            logger.warn(`⚠️ Failed to emit progress update for ${sessionId}:`, socketError);
          }
        });
      }
    } catch (error) {
      logger.error(`❌ Failed to update session progress for ${sessionId}:`, error);
    }
  }
  getExecutionState(sessionId) {
    return this.runningExecutions.get(sessionId) || null;
  }
  async getNextMessageInfo(sessionId) {
    try {
      logger.debug(`🔍 Getting next message info for ${sessionId}`);
      const executionState = this.getExecutionState(sessionId);
      const session = await BlastSession.findOne({ where: { sessionId } });
      if (!session) {
        logger.debug(`❌ Session not found: ${sessionId}`);
        return null;
      }
      logger.debug(`📊 Session ${sessionId} status: ${session.status}, hasExecutionState: ${!!executionState}`);
      if (!executionState || session.status !== 'RUNNING') {
        return {
          isRunning: false,
          status: session.status,
          nextMessageIn: null,
          nextSendAt: null,
          nextContact: null
        };
      }
      const nextMessage = await BlastMessage.findOne({
        where: {
          sessionId,
          status: 'pending'
        },
        order: [['messageIndex', 'ASC']],
        limit: 1
      });
      let nextMessageIn = null;
      let nextSendAt = null;
      if (executionState.nextContactDelayEndsAt) {
        const now = new Date();
        const delayEndsAt = new Date(executionState.nextContactDelayEndsAt);
        nextMessageIn = Math.max(0, Math.floor((delayEndsAt - now) / 1000)); 
        nextSendAt = delayEndsAt;
      } else if (executionState.lastMessageSentAt) {
        const contactDelay = session.config?.contactDelay;
        if (contactDelay) {
          const avgDelay = (contactDelay.min + contactDelay.max) / 2;
          const lastSentTime = new Date(executionState.lastMessageSentAt);
          const estimatedNextSend = new Date(lastSentTime.getTime() + (avgDelay * 1000));
          const now = new Date();
          nextMessageIn = Math.max(0, Math.floor((estimatedNextSend - now) / 1000));
          nextSendAt = estimatedNextSend;
        }
      }
      const result = {
        isRunning: true,
        status: session.status,
        nextMessageIn, 
        nextSendAt: nextSendAt ? nextSendAt.toISOString() : null, 
        nextContact: nextMessage ? {
          phone: nextMessage.phone,
          name: nextMessage.contactName || nextMessage.phone,
          index: nextMessage.messageIndex
        } : null,
        lastMessageSentAt: executionState.lastMessageSentAt,
        lastMessagePhone: executionState.lastMessagePhone,
        lastMessageContact: executionState.lastMessageContact
      };
      logger.debug(`✅ Next message info for ${sessionId}:`, JSON.stringify(result, null, 2));
      return result;
    } catch (error) {
      logger.error(`❌ Failed to get next message info for ${sessionId}:`, error.message);
      logger.error(`Stack trace:`, error.stack);
      return null;
    }
  }
}
const serviceInstance = new BlastExecutionService();
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
  completeExecution: BlastExecutionService.prototype.completeExecution,
  getExecutionState: serviceInstance.getExecutionState.bind(serviceInstance),
  getNextMessageInfo: serviceInstance.getNextMessageInfo.bind(serviceInstance)
};
