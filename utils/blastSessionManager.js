const logger = require("./logger");
const BlastSession = require("../models/blastSessionModel");
const BlastMessage = require("../models/blastMessageModel");
const SpinTextEngine = require("./spinTextEngine");
class BlastSessionManager {
  constructor() {
    this.activeSessions = new Map(); 
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
      const userConfig = { ...config };
      logger.info(`📊 Creating session with user config:`, {
        userProvidedFields: Object.keys(config),
        configToStore: userConfig,
      });
      const session = await BlastSession.create({
        sessionId,
        userId,
        whatsappSessionId,
        campaignName,
        messageTemplate,
        totalMessages: messageList.length,
        status: "IDLE",
        config: userConfig, 
      });
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
  async startSession(sessionId, forceStart = false) {
    try {
      const session = await BlastSession.findOne({ where: { sessionId } });
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }
      if (session.status !== "IDLE" && session.status !== "PAUSED") {
        throw new Error(`Cannot start session in ${session.status} state`);
      }
      await session.update({
        status: "RUNNING",
        startedAt: session.startedAt || new Date(),
        resumedAt: session.status === "PAUSED" ? new Date() : null,
      });
      this.activeSessions.set(sessionId, {
        sessionId,
        status: "RUNNING",
        startedAt: new Date(),
        userId: session.userId,
      });
      const { BlastExecutionService } = require("../services/blastExecutionService");
      const executionService = new BlastExecutionService();
      await executionService.startExecution(sessionId, forceStart);
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
  async pauseSession(sessionId) {
    try {
      const session = await BlastSession.findOne({ where: { sessionId } });
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }
      if (session.status !== "RUNNING") {
        throw new Error(`Cannot pause session in ${session.status} state`);
      }
      const { BlastExecutionService } = require("../services/blastExecutionService");
      const executionService = new BlastExecutionService();
      await executionService.pauseExecution(sessionId);
      await session.update({
        status: "PAUSED",
        pausedAt: new Date(),
      });
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
  async resumeSession(sessionId) {
    try {
      const session = await BlastSession.findOne({ where: { sessionId } });
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }
      if (session.status !== "PAUSED") {
        throw new Error(`Cannot resume session in ${session.status} state`);
      }
      const { BlastExecutionService } = require("../services/blastExecutionService");
      const executionService = new BlastExecutionService();
      await executionService.resumeExecution(sessionId);
      await session.update({
        status: "RUNNING",
        resumedAt: new Date(),
      });
      if (this.activeSessions.has(sessionId)) {
        const activeSession = this.activeSessions.get(sessionId);
        activeSession.status = "RUNNING";
        activeSession.resumedAt = new Date();
      } else {
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
  async stopSession(sessionId) {
    try {
      const session = await BlastSession.findOne({ where: { sessionId } });
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }
      if (!["RUNNING", "PAUSED"].includes(session.status)) {
        throw new Error(`Cannot stop session in ${session.status} state`);
      }
      const { BlastExecutionService } = require("../services/blastExecutionService");
      const executionService = new BlastExecutionService();
      await executionService.stopExecution(sessionId);
      await session.update({
        status: "STOPPED",
        stoppedAt: new Date(),
      });
      this.activeSessions.delete(sessionId);
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
  async getSessionStatus(sessionId) {
    try {
      const session = await BlastSession.findBySessionId(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }
      const stats = await BlastMessage.getSessionStats(sessionId);
      const statsMap = stats.reduce((acc, stat) => {
        acc[stat.status] = parseInt(stat.count);
        return acc;
      }, {});
      const completed =
        (statsMap.sent || 0) + (statsMap.failed || 0) + (statsMap.skipped || 0);
      const progressPercentage =
        session.totalMessages > 0
          ? ((completed / session.totalMessages) * 100).toFixed(2)
          : 0;
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
  async getNextMessages(sessionId, limit = 10) {
    try {
      let messages = await BlastMessage.findPendingBySession(sessionId, limit);
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
  applyRuntimeConfig(userConfig = {}) {
    const accountAge = userConfig.accountAge || 'NEW';
    const defaultConfig = this.getDefaultConfig(accountAge);
    return this.deepMergeConfig(defaultConfig, userConfig);
  }
  deepMergeConfig(defaultConfig, userConfig) {
    const merged = { ...defaultConfig };
    for (const key in userConfig) {
      if (userConfig[key] !== undefined && userConfig[key] !== null) {
        if (
          typeof userConfig[key] === 'object' && 
          !Array.isArray(userConfig[key]) &&
          typeof defaultConfig[key] === 'object' &&
          !Array.isArray(defaultConfig[key])
        ) {
          merged[key] = { ...defaultConfig[key], ...userConfig[key] };
        } else {
          merged[key] = userConfig[key];
        }
      }
    }
    return merged;
  }
  getDefaultConfig(accountAge = 'NEW') {
    const ageConfigs = {
      NEW: {
        contactDelay: { min: 90, max: 300 },    
        dailyLimit: { min: 40, max: 60 },       
        restDelay: { min: 60, max: 120 },       
        restThreshold: { min: 15, max: 25 },    
      },
      WARMING: {
        contactDelay: { min: 60, max: 180 },    
        dailyLimit: { min: 80, max: 120 },      
        restDelay: { min: 45, max: 90 },        
        restThreshold: { min: 25, max: 40 },    
      },
      ESTABLISHED: {
        contactDelay: { min: 45, max: 150 },    
        dailyLimit: { min: 150, max: 200 },     
        restDelay: { min: 30, max: 60 },        
        restThreshold: { min: 40, max: 60 },    
      },
    };
    const selectedConfig = ageConfigs[accountAge] || ageConfigs.NEW;
    return {
      messageDelay: { min: 2, max: 10 }, 
      contactDelay: selectedConfig.contactDelay, 
      restDelay: selectedConfig.restDelay,       
      dailyLimit: selectedConfig.dailyLimit,     
      restThreshold: selectedConfig.restThreshold, 
      businessHours: {
        enabled: true,
        startHour: 9,           
        endHour: 17,            
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
}
module.exports = new BlastSessionManager();
