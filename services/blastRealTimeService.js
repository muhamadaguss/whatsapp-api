const logger = require("../utils/logger");
const { getSocket } = require("../auth/socket");
const BlastSession = require("../models/blastSessionModel");
const BlastMessage = require("../models/blastMessageModel");
let instance = null;
class BlastRealTimeService {
  constructor() {
    if (instance) {
      return instance;
    }
    this.socket = null;
    instance = this;
  }
  init() {
    try {
      this.socket = getSocket();
      if (!this.socket) {
        logger.warn("⚠️ Socket not available during BlastRealTimeService initialization");
      } else {
        logger.info("🚀 BlastRealTimeService initialized with socket connection");
      }
    } catch (error) {
      logger.warn("⚠️ Socket not available for BlastRealTimeService, will retry on demand:", error.message);
      this.socket = null;
    }
  }
  getSocket() {
    if (!this.socket) {
      try {
        this.socket = getSocket();
      } catch (error) {
        logger.warn("⚠️ Failed to get socket instance:", error.message);
        return null;
      }
    }
    return this.socket;
  }
  calculateProgressPercentage(session) {
    if (!session || !session.totalMessages || session.totalMessages === 0) {
      return 0;
    }
    const processedCount = (session.sentCount || 0) + (session.failedCount || 0) + (session.skippedCount || 0);
    const percentage = (processedCount / session.totalMessages) * 100;
    return Math.min(Math.round(percentage * 100) / 100, 100); 
  }
  async emitSessionProgress(sessionId, progressData = {}) {
    try {
      const socket = this.getSocket();
      if (!socket) {
        logger.warn("⚠️ Socket not available for session progress emission");
        return;
      }
      const session = await BlastSession.findOne({
        where: { sessionId },
        include: [
          {
            model: require("../models/sessionModel"),
            as: "whatsappSession",
            attributes: ["sessionId", "phoneNumber", "displayName", "status"]
          }
        ]
      });
      if (!session) {
        logger.warn(`⚠️ Session ${sessionId} not found for progress emission`);
        return;
      }
      const progressPercentage = this.calculateProgressPercentage(session);
      const progressInfo = {
        sessionId: session.sessionId,
        userId: session.userId,
        status: session.status,
        campaignName: session.campaignName,
        totalMessages: session.totalMessages,
        currentIndex: session.currentIndex,
        sentCount: session.sentCount,
        failedCount: session.failedCount,
        skippedCount: session.skippedCount,
        progressPercentage,
        processedCount: session.sentCount + session.failedCount + session.skippedCount,
        remainingCount: session.totalMessages - (session.sentCount + session.failedCount + session.skippedCount),
        estimatedCompletion: session.estimatedCompletion,
        whatsappAccount: session.whatsappSession ? {
          sessionId: session.whatsappSession.sessionId,
          phoneNumber: session.whatsappSession.phoneNumber,
          displayName: session.whatsappSession.displayName,
          status: session.whatsappSession.status
        } : null,
        timestamp: new Date().toISOString(),
        ...progressData
      };
      socket.to(`user_${session.userId}`).emit("blast-progress-update", progressInfo);
      socket.to("admin").emit("blast-progress-update", progressInfo);
      logger.debug(`📡 Emitted progress update for session ${sessionId}: ${progressPercentage}% (${progressInfo.processedCount}/${session.totalMessages})`);
      return progressInfo;
    } catch (error) {
      logger.error(`❌ Failed to emit session progress for ${sessionId}:`, error);
      throw error;
    }
  }
  async emitFailedMessage(sessionId, failureData) {
    try {
      const socket = this.getSocket();
      if (!socket) {
        logger.warn("⚠️ Socket not available for failed message emission");
        return;
      }
      const session = await BlastSession.findOne({
        where: { sessionId },
        attributes: ["userId", "sessionId", "campaignName"]
      });
      if (!session) {
        logger.warn(`⚠️ Session ${sessionId} not found for failed message emission`);
        return;
      }
      const failedMessageInfo = {
        sessionId,
        userId: session.userId,
        campaignName: session.campaignName,
        messageIndex: failureData.messageIndex || null,
        phoneNumber: failureData.phoneNumber || null,
        contactName: failureData.contactName || null,
        errorType: failureData.errorType || "unknown",
        errorMessage: failureData.errorMessage || "Unknown error",
        errorCode: failureData.errorCode || null,
        retryCount: failureData.retryCount || 0,
        maxRetries: failureData.maxRetries || 3,
        canRetry: (failureData.retryCount || 0) < (failureData.maxRetries || 3),
        timestamp: new Date().toISOString(),
        failedAt: failureData.failedAt || new Date().toISOString()
      };
      socket.to(`user_${session.userId}`).emit("blast-message-failed", failedMessageInfo);
      socket.to("admin").emit("blast-message-failed", failedMessageInfo);
      logger.debug(`❌ Emitted failed message for session ${sessionId}: ${failureData.phoneNumber} - ${failureData.errorType}`);
      await this.emitSessionProgress(sessionId, {
        lastFailedMessage: failedMessageInfo
      });
      return failedMessageInfo;
    } catch (error) {
      logger.error(`❌ Failed to emit failed message for ${sessionId}:`, error);
      throw error;
    }
  }
  async emitSuccessMessage(sessionId, successData) {
    try {
      const socket = this.getSocket();
      if (!socket) {
        logger.warn("⚠️ Socket not available for success message emission");
        return;
      }
      const session = await BlastSession.findOne({
        where: { sessionId },
        attributes: ["userId", "sessionId", "campaignName"]
      });
      if (!session) {
        logger.warn(`⚠️ Session ${sessionId} not found for success message emission`);
        return;
      }
      const successMessageInfo = {
        sessionId,
        userId: session.userId,
        campaignName: session.campaignName,
        messageIndex: successData.messageIndex || null,
        phoneNumber: successData.phoneNumber || null,
        contactName: successData.contactName || null,
        whatsappMessageId: successData.whatsappMessageId || null,
        sentAt: successData.sentAt || new Date().toISOString(),
        timestamp: new Date().toISOString()
      };
      socket.to(`user_${session.userId}`).emit("blast-message-success", successMessageInfo);
      logger.debug(`✅ Emitted success message for session ${sessionId}: ${successData.phoneNumber}`);
      await this.emitSessionProgress(sessionId, {
        lastSuccessMessage: successMessageInfo
      });
      return successMessageInfo;
    } catch (error) {
      logger.error(`❌ Failed to emit success message for ${sessionId}:`, error);
      throw error;
    }
  }
  async emitSessionStatusChange(sessionId, newStatus, additionalData = {}) {
    try {
      const socket = this.getSocket();
      if (!socket) {
        logger.warn("⚠️ Socket not available for status change emission");
        return;
      }
      const session = await BlastSession.findOne({
        where: { sessionId },
        include: [
          {
            model: require("../models/sessionModel"),
            as: "whatsappSession",
            attributes: ["sessionId", "phoneNumber", "displayName"]
          }
        ]
      });
      if (!session) {
        logger.warn(`⚠️ Session ${sessionId} not found for status change emission`);
        return;
      }
      const statusInfo = {
        sessionId,
        userId: session.userId,
        campaignName: session.campaignName,
        oldStatus: session.status,
        newStatus,
        progressPercentage: this.calculateProgressPercentage(session),
        totalMessages: session.totalMessages,
        sentCount: session.sentCount,
        failedCount: session.failedCount,
        skippedCount: session.skippedCount,
        whatsappAccount: session.whatsappSession ? {
          sessionId: session.whatsappSession.sessionId,
          phoneNumber: session.whatsappSession.phoneNumber,
          displayName: session.whatsappSession.displayName
        } : null,
        timestamp: new Date().toISOString(),
        ...additionalData
      };
      socket.to(`user_${session.userId}`).emit("blast-status-change", statusInfo);
      socket.to("admin").emit("blast-status-change", statusInfo);
      logger.info(`📡 Emitted status change for session ${sessionId}: ${session.status} → ${newStatus}`);
      return statusInfo;
    } catch (error) {
      logger.error(`❌ Failed to emit status change for ${sessionId}:`, error);
      throw error;
    }
  }
  async emitSessionsUpdate(userId = null) {
    try {
      const socket = this.getSocket();
      if (!socket) {
        logger.warn("⚠️ Socket not available for sessions update emission");
        return;
      }
      if (userId) {
        const userSessions = await BlastSession.findAll({
          where: { userId },
          include: [
            {
              model: require("../models/sessionModel"),
              as: "whatsappSession",
              attributes: ["sessionId", "phoneNumber", "displayName", "status", "connectionQuality"]
            }
          ],
          order: [["createdAt", "DESC"]],
          limit: 50 
        });
        const sessionsWithProgress = await Promise.all(userSessions.map(async (session) => {
          const sessionData = {
            ...session.toJSON(),
            progressPercentage: this.calculateProgressPercentage(session),
            processedCount: session.sentCount + session.failedCount + session.skippedCount,
            remainingCount: session.totalMessages - (session.sentCount + session.failedCount + session.skippedCount)
          };
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
          if (sessionData.status === 'RUNNING') {
            try {
              const blastExecutionService = require('./blastExecutionService');
              const nextMessageInfo = await blastExecutionService.getNextMessageInfo(sessionData.sessionId);
              sessionData.nextMessageInfo = nextMessageInfo;
              logger.debug(`✅ Got next message info for ${sessionData.sessionId} in socket emission`);
            } catch (error) {
              logger.error(`❌ Failed to get next message info for ${sessionData.sessionId} in socket:`, error);
              sessionData.nextMessageInfo = null;
            }
          } else {
            sessionData.nextMessageInfo = null;
          }
          delete sessionData.whatsappSession;
          return sessionData;
        }));
        socket.to(`user_${userId}`).emit("sessions-update", sessionsWithProgress);
        logger.debug(`📡 Emitted sessions update to user ${userId}: ${sessionsWithProgress.length} sessions`);
        return sessionsWithProgress;
      } else {
        const allUsers = await BlastSession.findAll({
          attributes: ["userId"],
          group: ["userId"],
          raw: true
        });
        for (const userObj of allUsers) {
          await this.emitSessionsUpdate(userObj.userId);
        }
        logger.debug(`📡 Emitted sessions update to all users: ${allUsers.length} users`);
      }
    } catch (error) {
      logger.error("❌ Failed to emit sessions update:", error);
      throw error;
    }
  }
  emitToastNotification(type, title, description, userId = null, sessionId = null) {
    try {
      const socket = this.getSocket();
      if (!socket) {
        logger.warn("⚠️ Socket not available for toast notification");
        return;
      }
      const toastData = {
        type,
        title,
        description,
        sessionId,
        timestamp: new Date().toISOString(),
        id: `toast_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      };
      if (userId) {
        socket.to(`user_${userId}`).emit("toast-notification", toastData);
      } else {
        socket.emit("toast-notification", toastData);
      }
      logger.debug(`🍞 Emitted toast notification: ${type} - ${title}`);
      return toastData;
    } catch (error) {
      logger.error("❌ Failed to emit toast notification:", error);
      throw error;
    }
  }
  async emitCampaignCompletion(sessionId, completionData = {}) {
    try {
      const session = await BlastSession.findOne({
        where: { sessionId },
        include: [
          {
            model: require("../models/sessionModel"),
            as: "whatsappSession",
            attributes: ["sessionId", "phoneNumber", "displayName"]
          }
        ]
      });
      if (!session) {
        logger.warn(`⚠️ Session ${sessionId} not found for completion emission`);
        return;
      }
      const completionInfo = {
        sessionId,
        userId: session.userId,
        campaignName: session.campaignName,
        totalMessages: session.totalMessages,
        sentCount: session.sentCount,
        failedCount: session.failedCount,
        skippedCount: session.skippedCount,
        progressPercentage: 100,
        startedAt: session.startedAt,
        completedAt: session.completedAt || new Date().toISOString(),
        duration: session.startedAt ? 
          Math.round((new Date() - new Date(session.startedAt)) / 1000) : null,
        successRate: session.totalMessages > 0 ? 
          Math.round((session.sentCount / session.totalMessages) * 100 * 100) / 100 : 0,
        failureRate: session.totalMessages > 0 ? 
          Math.round((session.failedCount / session.totalMessages) * 100 * 100) / 100 : 0,
        whatsappAccount: session.whatsappSession ? {
          sessionId: session.whatsappSession.sessionId,
          phoneNumber: session.whatsappSession.phoneNumber,
          displayName: session.whatsappSession.displayName
        } : null,
        timestamp: new Date().toISOString(),
        ...completionData
      };
      await this.emitSessionStatusChange(sessionId, "COMPLETED", completionInfo);
      const socket = this.getSocket();
      if (socket) {
        socket.to(`user_${session.userId}`).emit("campaign-completed", completionInfo);
        socket.to("admin").emit("campaign-completed", completionInfo);
      }
      this.emitToastNotification(
        "success",
        "Campaign Completed",
        `Campaign "${session.campaignName}" completed successfully. Sent: ${session.sentCount}, Failed: ${session.failedCount}`,
        session.userId,
        sessionId
      );
      logger.info(`🎉 Campaign ${sessionId} completed: ${session.sentCount}/${session.totalMessages} sent`);
      return completionInfo;
    } catch (error) {
      logger.error(`❌ Failed to emit campaign completion for ${sessionId}:`, error);
      throw error;
    }
  }
}
module.exports = BlastRealTimeService;
