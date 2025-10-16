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
   * ========== PHASE 1: ACCOUNT AGE-BASED CONFIGURATION ==========
   * ✨ OPSI 2: Hanya simpan config yang dikirim user, apply default saat runtime
   * @param {Object} params - Session parameters
   * @param {string} params.accountAge - Account age: 'NEW', 'WARMING', 'ESTABLISHED'
   * @returns {Object} - Created session
   */
  async createSession({
    userId,
    whatsappSessionId,
    campaignName,
    messageTemplate,
    messageList,
    config = {},
    accountAge = 'NEW', // ⚠️ PHASE 1: Default to ultra-safe NEW mode
  }) {
    const sessionId = `blast_${Date.now()}_${Math.random()
      .toString(36)
      .substring(7)}`;

    try {
      // ✨ NEW APPROACH: Store only user-provided config + accountAge
      // Default config akan di-apply saat execution/query, bukan saat save
      const userConfig = {
        ...config,
        accountAge: config.accountAge || accountAge, // Store account age for later
      };
      
      logger.info(`📊 Creating session with user config:`, {
        accountAge: userConfig.accountAge,
        userProvidedFields: Object.keys(config),
        configToStore: userConfig,
      });

      // Create session record (simpan HANYA user config, tidak merge dengan default)
      const session = await BlastSession.create({
        sessionId,
        userId,
        whatsappSessionId,
        campaignName,
        messageTemplate,
        totalMessages: messageList.length,
        status: "IDLE",
        config: userConfig, // ✨ Simpan user config saja, tanpa default
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
   * @param {boolean} forceStart - Force start bypassing health checks
   * @returns {Object} - Start result
   */
  async startSession(sessionId, forceStart = false) {
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
      const { BlastExecutionService } = require("../services/blastExecutionService");
      const executionService = new BlastExecutionService();
      await executionService.pauseExecution(sessionId);

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
      const { BlastExecutionService } = require("../services/blastExecutionService");
      const executionService = new BlastExecutionService();
      await executionService.resumeExecution(sessionId);

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
      const { BlastExecutionService } = require("../services/blastExecutionService");
      const executionService = new BlastExecutionService();
      await executionService.stopExecution(sessionId);

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
   * ✨ NEW: Apply runtime config (merge user config dengan default config)
   * Digunakan saat execution atau query session untuk mendapatkan full config
   * @param {Object} userConfig - User-provided config dari database
   * @returns {Object} - Full merged configuration
   */
  applyRuntimeConfig(userConfig = {}) {
    const accountAge = userConfig.accountAge || 'NEW';
    const defaultConfig = this.getDefaultConfig(accountAge);
    
    // Deep merge: user config override default
    return this.deepMergeConfig(defaultConfig, userConfig);
  }

  /**
   * Deep merge configuration objects
   * User config takes priority over default config for nested objects
   * @param {Object} defaultConfig - Default configuration
   * @param {Object} userConfig - User-provided configuration
   * @returns {Object} - Merged configuration
   */
  deepMergeConfig(defaultConfig, userConfig) {
    const merged = { ...defaultConfig };
    
    for (const key in userConfig) {
      if (userConfig[key] !== undefined && userConfig[key] !== null) {
        // If both are objects (but not arrays), merge them recursively
        if (
          typeof userConfig[key] === 'object' && 
          !Array.isArray(userConfig[key]) &&
          typeof defaultConfig[key] === 'object' &&
          !Array.isArray(defaultConfig[key])
        ) {
          merged[key] = { ...defaultConfig[key], ...userConfig[key] };
        } else {
          // Otherwise, user config takes priority
          merged[key] = userConfig[key];
        }
      }
    }
    
    return merged;
  }

  /**
   * Get default configuration with account age-based safety settings
   * ========== PHASE 1: ACCOUNT AGE-BASED DELAYS (BAN PREVENTION) ==========
   * @param {string} accountAge - Age category: 'NEW' (0-7 days), 'WARMING' (8-30 days), 'ESTABLISHED' (30+ days)
   * @returns {Object} - Default config optimized for account age
   */
  getDefaultConfig(accountAge = 'NEW') {
    // Define age-based configurations to mimic human behavior patterns
    const ageConfigs = {
      NEW: {
        // ULTRA-SAFE: For accounts 0-7 days old
        contactDelay: { min: 90, max: 300 },    // 1.5-5 minutes (was 30-120s = TOO FAST)
        dailyLimit: { min: 40, max: 60 },       // 40-60 messages (was 200-300 = DANGEROUS)
        restDelay: { min: 60, max: 120 },       // 1-2 hours rest (was 10-30min = TOO SHORT)
        restThreshold: { min: 15, max: 25 },    // Rest after 15-25 messages
      },
      WARMING: {
        // MODERATE-SAFE: For accounts 8-30 days old
        contactDelay: { min: 60, max: 180 },    // 1-3 minutes (was 30-120s)
        dailyLimit: { min: 80, max: 120 },      // 80-120 messages (was 200-300)
        restDelay: { min: 45, max: 90 },        // 45-90 minutes rest (was 10-30min)
        restThreshold: { min: 25, max: 40 },    // Rest after 25-40 messages
      },
      ESTABLISHED: {
        // BALANCED: For accounts 30+ days old
        contactDelay: { min: 45, max: 150 },    // 45s-2.5min (was 30-120s)
        dailyLimit: { min: 150, max: 200 },     // 150-200 messages (was 200-300)
        restDelay: { min: 30, max: 60 },        // 30-60 minutes rest (was 10-30min)
        restThreshold: { min: 40, max: 60 },    // Rest after 40-60 messages
      },
    };

    // Validate and get config for account age
    const selectedConfig = ageConfigs[accountAge] || ageConfigs.NEW;

    return {
      messageDelay: { min: 2, max: 10 }, // seconds between API calls (keep existing)
      contactDelay: selectedConfig.contactDelay, // ⚠️ CRITICAL: Age-based human-like delays
      restDelay: selectedConfig.restDelay,       // ⚠️ CRITICAL: Longer recovery periods
      dailyLimit: selectedConfig.dailyLimit,     // ⚠️ CRITICAL: Conservative message limits
      restThreshold: selectedConfig.restThreshold, // When to trigger rest
      businessHours: {
        enabled: true,
        startHour: 9,           // ⚠️ PHASE 1: Changed from 8 to 9 (realistic work hours)
        endHour: 17,            // ⚠️ PHASE 1: Changed from 21 to 17 (5PM, not 9PM!)
        excludeWeekends: true,  // ⚠️ PHASE 1: Changed from false (humans rest on weekends)
        excludeLunchBreak: true, // ⚠️ PHASE 1: Changed from false (humans take lunch)
        lunchStart: 12,
        lunchEnd: 13,
      },
      retryConfig: {
        maxRetries: 3,
        retryDelay: 60, // seconds
      },
      // Store account age for logging/monitoring
      accountAge: accountAge,
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
