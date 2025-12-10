const logger = require("../utils/logger");
const AccountHealthService = require("./accountHealthService");
const BlastSession = require("../models/blastSessionModel");
class RecoveryModeService {
  constructor() {
    this.accountHealthService = new AccountHealthService();
    this.recoverySessions = new Map();
    this.pausedSessions = new Map();
    this.recoveryConfigs = {
      CRITICAL: {
        throttleMultiplier: 3.0,
        pauseDuration: 14400000, 
        recoveryDuration: 172800000, 
        message: 'Critical health - Entering 48h recovery mode'
      },
      SEVERE: {
        throttleMultiplier: 2.5,
        pauseDuration: 7200000, 
        recoveryDuration: 86400000, 
        message: 'Severe health degradation - Entering 24h recovery mode'
      },
      MODERATE: {
        throttleMultiplier: 2.0,
        pauseDuration: 3600000, 
        recoveryDuration: 43200000, 
        message: 'Moderate health concerns - Entering 12h recovery mode'
      },
      MILD: {
        throttleMultiplier: 1.5,
        pauseDuration: 0, 
        recoveryDuration: 21600000, 
        message: 'Mild health degradation - Applying conservative settings'
      }
    };
    this.monitoringInterval = null;
    this.monitoringFrequency = 60000; 
  }
  async checkAndThrottle(sessionId) {
    try {
      const session = await BlastSession.findOne({ where: { sessionId } });
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }
      const healthAssessment = await this.accountHealthService.calculateAccountHealth(
        session.whatsapp_session_id,
        this.getAccountAgeInDays(session.accountAge)
      );
      const healthScore = healthAssessment.healthScore;
      let throttleLevel = 'NONE';
      let throttleConfig = null;
      let shouldPause = false;
      let pauseDuration = 0;
      let shouldStop = false;
      let shouldEnterRecovery = false;
      if (healthScore < 30) {
        throttleLevel = 'CRITICAL';
        throttleConfig = this.recoveryConfigs.CRITICAL;
        shouldStop = true;
        shouldEnterRecovery = true;
        shouldPause = true;
        pauseDuration = throttleConfig.pauseDuration;
      } else if (healthScore < 50) {
        throttleLevel = 'SEVERE';
        throttleConfig = this.recoveryConfigs.SEVERE;
        shouldEnterRecovery = true;
        shouldPause = true;
        pauseDuration = throttleConfig.pauseDuration;
      } else if (healthScore < 70) {
        throttleLevel = 'MODERATE';
        throttleConfig = this.recoveryConfigs.MODERATE;
        shouldEnterRecovery = true;
        shouldPause = true;
        pauseDuration = throttleConfig.pauseDuration;
      } else if (healthScore < 85) {
        throttleLevel = 'MILD';
        throttleConfig = this.recoveryConfigs.MILD;
      }
      if (shouldEnterRecovery && throttleConfig) {
        await this.enterRecoveryMode(sessionId, throttleLevel, throttleConfig);
      }
      if (throttleLevel !== 'NONE') {
        logger.warn(`🏥 [Recovery] Session ${sessionId}: Health=${healthScore}, Level=${throttleLevel}, Pause=${pauseDuration/1000}s`);
      }
      return {
        sessionId,
        healthScore,
        throttleLevel,
        throttleMultiplier: throttleConfig?.throttleMultiplier || 1.0,
        shouldPause,
        pauseDuration,
        shouldStop,
        shouldEnterRecovery,
        message: throttleConfig?.message || 'Health normal',
        healthDetails: healthAssessment
      };
    } catch (error) {
      logger.error(`[Recovery] Error checking health for session ${sessionId}:`, error);
      return {
        sessionId,
        throttleLevel: 'NONE',
        throttleMultiplier: 1.0,
        shouldPause: false,
        error: error.message
      };
    }
  }
  async enterRecoveryMode(sessionId, level, config) {
    try {
      const recoveryInfo = {
        sessionId,
        level,
        startTime: Date.now(),
        endTime: Date.now() + config.recoveryDuration,
        throttleMultiplier: config.throttleMultiplier,
        message: config.message
      };
      this.recoverySessions.set(sessionId, recoveryInfo);
      await BlastSession.update(
        { 
          recovery_mode: true,
          recovery_level: level,
          recovery_start: new Date(),
          recovery_end: new Date(recoveryInfo.endTime)
        },
        { where: { sessionId } }
      );
      logger.warn(`🏥 [Recovery] Session ${sessionId} entered ${level} recovery mode for ${config.recoveryDuration/3600000}h`);
    } catch (error) {
      logger.error(`[Recovery] Error entering recovery mode:`, error);
    }
  }
  isInRecoveryMode(sessionId) {
    const recoveryInfo = this.recoverySessions.get(sessionId);
    if (!recoveryInfo) {
      return null;
    }
    if (Date.now() > recoveryInfo.endTime) {
      this.exitRecoveryMode(sessionId);
      return null;
    }
    return recoveryInfo;
  }
  async exitRecoveryMode(sessionId) {
    try {
      const recoveryInfo = this.recoverySessions.get(sessionId);
      if (recoveryInfo) {
        const duration = Date.now() - recoveryInfo.startTime;
        logger.info(`🏥 [Recovery] Session ${sessionId} exiting ${recoveryInfo.level} recovery mode after ${duration/3600000}h`);
        this.recoverySessions.delete(sessionId);
        await BlastSession.update(
          { 
            recovery_mode: false,
            recovery_level: null,
            recovery_start: null,
            recovery_end: null
          },
          { where: { sessionId } }
        );
      }
    } catch (error) {
      logger.error(`[Recovery] Error exiting recovery mode:`, error);
    }
  }
  async getRecoveryAdjustedConfig(sessionId, baseConfig) {
    const recoveryInfo = this.isInRecoveryMode(sessionId);
    if (!recoveryInfo) {
      return baseConfig; 
    }
    const multiplier = recoveryInfo.throttleMultiplier;
    const adjustedConfig = {
      ...baseConfig,
      contactDelay: {
        min: Math.round((baseConfig.contactDelay?.min || 60) * multiplier),
        max: Math.round((baseConfig.contactDelay?.max || 180) * multiplier)
      },
      restDelay: {
        min: Math.round((baseConfig.restDelay?.min || 30) * multiplier),
        max: Math.round((baseConfig.restDelay?.max || 90) * multiplier)
      },
      dailyLimit: Math.round((baseConfig.dailyLimit || 100) * 0.5), 
      recoveryMode: true,
      recoveryLevel: recoveryInfo.level,
      recoveryMultiplier: multiplier
    };
    logger.info(`🏥 [Recovery] Config adjusted for ${recoveryInfo.level} recovery: ${baseConfig.contactDelay?.min}-${baseConfig.contactDelay?.max}s → ${adjustedConfig.contactDelay.min}-${adjustedConfig.contactDelay.max}s`);
    return adjustedConfig;
  }
  async getRecommendedPause(sessionId) {
    const throttleDecision = await this.checkAndThrottle(sessionId);
    if (throttleDecision.shouldPause) {
      return {
        shouldPause: true,
        duration: throttleDecision.pauseDuration,
        reason: throttleDecision.message,
        healthScore: throttleDecision.healthScore,
        level: throttleDecision.throttleLevel
      };
    }
    return {
      shouldPause: false,
      healthScore: throttleDecision.healthScore
    };
  }
  scheduleRecoveryCheck(sessionId, checkInterval = 3600000) {
    const intervalId = setInterval(async () => {
      try {
        const session = await BlastSession.findOne({ where: { sessionId } });
        if (!session || session.status === 'completed' || session.status === 'stopped') {
          clearInterval(intervalId);
          return;
        }
        const decision = await this.checkAndThrottle(sessionId);
        if (decision.shouldStop) {
          logger.warn(`🚨 [Recovery] Auto-stopping session ${sessionId} due to critical health (${decision.healthScore})`);
        }
      } catch (error) {
        logger.error(`[Recovery] Error in scheduled check:`, error);
        clearInterval(intervalId);
      }
    }, checkInterval);
    logger.info(`🏥 [Recovery] Scheduled auto-recovery checks for session ${sessionId} every ${checkInterval/60000} minutes`);
    return intervalId;
  }
  startContinuousMonitoring() {
    if (this.monitoringInterval) {
      logger.warn('[Recovery] Monitoring already active');
      return;
    }
    this.monitoringInterval = setInterval(async () => {
      try {
        const activeSessions = await BlastSession.findAll({
          where: { status: 'running' }
        });
        for (const session of activeSessions) {
          const decision = await this.checkAndThrottle(session.sessionId);
          if (decision.shouldStop && !this.pausedSessions.has(session.sessionId)) {
            logger.error(`🚨 [Recovery] CRITICAL: Session ${session.sessionId} health at ${decision.healthScore} - STOPPING`);
            this.pausedSessions.set(session.sessionId, {
              pausedAt: Date.now(),
              reason: decision.message,
              healthScore: decision.healthScore
            });
          }
        }
      } catch (error) {
        logger.error('[Recovery] Error in continuous monitoring:', error);
      }
    }, this.monitoringFrequency);
    logger.info(`🏥 [Recovery] Continuous monitoring started (check every ${this.monitoringFrequency/1000}s)`);
  }
  stopContinuousMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      logger.info('[Recovery] Continuous monitoring stopped');
    }
  }
  getAccountAgeInDays(accountAge) {
    switch(accountAge) {
      case 'NEW': return 3;
      case 'WARMING': return 15;
      case 'ESTABLISHED': return 60;
      default: return 3;
    }
  }
  getRecoveryStats() {
    const stats = {
      activeRecoverySessions: this.recoverySessions.size,
      pausedSessions: this.pausedSessions.size,
      monitoringActive: !!this.monitoringInterval,
      recoveryLevels: {}
    };
    for (const [sessionId, info] of this.recoverySessions.entries()) {
      stats.recoveryLevels[info.level] = (stats.recoveryLevels[info.level] || 0) + 1;
    }
    return stats;
  }
  async forceExitRecovery(sessionId) {
    await this.exitRecoveryMode(sessionId);
    logger.warn(`[Recovery] Forced exit from recovery mode for session ${sessionId}`);
  }
  resetRecoveryStates() {
    this.recoverySessions.clear();
    this.pausedSessions.clear();
    logger.warn('[Recovery] All recovery states reset');
  }
}
let instance = null;
function getRecoveryModeService() {
  if (!instance) {
    instance = new RecoveryModeService();
  }
  return instance;
}
module.exports = {
  RecoveryModeService,
  getRecoveryModeService
};
