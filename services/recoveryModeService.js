/**
 * Recovery Mode Service - PHASE 3 TASK [P3-2]
 * 
 * Proactive Health Monitoring & Automatic Recovery System
 * 
 * Features:
 * - Proactive throttling based on health score
 * - Automatic pause when health is poor
 * - Recovery mode with extra slow settings
 * - Health-based config override
 * - Auto-recovery scheduling
 * 
 * Throttling Rules:
 * - Health < 70: Reduce velocity by 50%
 * - Health < 50: Pause for 2-4 hours
 * - Health < 30: Stop completely until recovery
 * 
 * @module recoveryModeService
 */

const logger = require("../utils/logger");
const AccountHealthService = require("./accountHealthService");
const BlastSession = require("../models/blastSessionModel");

class RecoveryModeService {
  constructor() {
    this.accountHealthService = new AccountHealthService();
    
    // Track sessions in recovery mode
    this.recoverySessions = new Map();
    
    // Track proactive pauses
    this.pausedSessions = new Map();
    
    // Recovery configurations
    this.recoveryConfigs = {
      CRITICAL: {
        throttleMultiplier: 3.0,
        pauseDuration: 14400000, // 4 hours
        recoveryDuration: 172800000, // 48 hours
        message: 'Critical health - Entering 48h recovery mode'
      },
      SEVERE: {
        throttleMultiplier: 2.5,
        pauseDuration: 7200000, // 2 hours
        recoveryDuration: 86400000, // 24 hours
        message: 'Severe health degradation - Entering 24h recovery mode'
      },
      MODERATE: {
        throttleMultiplier: 2.0,
        pauseDuration: 3600000, // 1 hour
        recoveryDuration: 43200000, // 12 hours
        message: 'Moderate health concerns - Entering 12h recovery mode'
      },
      MILD: {
        throttleMultiplier: 1.5,
        pauseDuration: 0, // No pause
        recoveryDuration: 21600000, // 6 hours
        message: 'Mild health degradation - Applying conservative settings'
      }
    };
    
    // Health monitoring interval
    this.monitoringInterval = null;
    this.monitoringFrequency = 60000; // Check every 1 minute
  }

  /**
   * Check health and apply proactive throttling
   * @param {string} sessionId - Blast session ID
   * @returns {Promise<Object>} Throttle decision
   */
  async checkAndThrottle(sessionId) {
    try {
      // Get current health assessment
      const session = await BlastSession.findOne({ where: { sessionId } });
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }
      
      const healthAssessment = await this.accountHealthService.calculateAccountHealth(
        session.whatsapp_session_id,
        this.getAccountAgeInDays(session.accountAge)
      );
      
      const healthScore = healthAssessment.healthScore;
      
      // Determine throttle level
      let throttleLevel = 'NONE';
      let throttleConfig = null;
      let shouldPause = false;
      let pauseDuration = 0;
      let shouldStop = false;
      let shouldEnterRecovery = false;
      
      if (healthScore < 30) {
        // CRITICAL: Stop completely
        throttleLevel = 'CRITICAL';
        throttleConfig = this.recoveryConfigs.CRITICAL;
        shouldStop = true;
        shouldEnterRecovery = true;
        shouldPause = true;
        pauseDuration = throttleConfig.pauseDuration;
      } else if (healthScore < 50) {
        // SEVERE: Long pause + recovery mode
        throttleLevel = 'SEVERE';
        throttleConfig = this.recoveryConfigs.SEVERE;
        shouldEnterRecovery = true;
        shouldPause = true;
        pauseDuration = throttleConfig.pauseDuration;
      } else if (healthScore < 70) {
        // MODERATE: Short pause + throttle
        throttleLevel = 'MODERATE';
        throttleConfig = this.recoveryConfigs.MODERATE;
        shouldEnterRecovery = true;
        shouldPause = true;
        pauseDuration = throttleConfig.pauseDuration;
      } else if (healthScore < 85) {
        // MILD: Just throttle, no pause
        throttleLevel = 'MILD';
        throttleConfig = this.recoveryConfigs.MILD;
      }
      
      // Enter recovery mode if needed
      if (shouldEnterRecovery && throttleConfig) {
        await this.enterRecoveryMode(sessionId, throttleLevel, throttleConfig);
      }
      
      // Log throttle decision
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

  /**
   * Enter recovery mode for a session
   * @param {string} sessionId - Session ID
   * @param {string} level - Recovery level (CRITICAL/SEVERE/MODERATE/MILD)
   * @param {Object} config - Recovery configuration
   */
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
      
      // Update session to mark recovery mode
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

  /**
   * Check if session is in recovery mode
   * @param {string} sessionId - Session ID
   * @returns {Object|null} Recovery info if in recovery mode
   */
  isInRecoveryMode(sessionId) {
    const recoveryInfo = this.recoverySessions.get(sessionId);
    
    if (!recoveryInfo) {
      return null;
    }
    
    // Check if recovery period ended
    if (Date.now() > recoveryInfo.endTime) {
      this.exitRecoveryMode(sessionId);
      return null;
    }
    
    return recoveryInfo;
  }

  /**
   * Exit recovery mode
   * @param {string} sessionId - Session ID
   */
  async exitRecoveryMode(sessionId) {
    try {
      const recoveryInfo = this.recoverySessions.get(sessionId);
      
      if (recoveryInfo) {
        const duration = Date.now() - recoveryInfo.startTime;
        logger.info(`🏥 [Recovery] Session ${sessionId} exiting ${recoveryInfo.level} recovery mode after ${duration/3600000}h`);
        
        this.recoverySessions.delete(sessionId);
        
        // Update session
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

  /**
   * Get recovery-adjusted config
   * @param {string} sessionId - Session ID
   * @param {Object} baseConfig - Base configuration
   * @returns {Promise<Object>} Adjusted configuration
   */
  async getRecoveryAdjustedConfig(sessionId, baseConfig) {
    const recoveryInfo = this.isInRecoveryMode(sessionId);
    
    if (!recoveryInfo) {
      return baseConfig; // Not in recovery mode
    }
    
    const multiplier = recoveryInfo.throttleMultiplier;
    
    // Apply multiplier to delays
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
      dailyLimit: Math.round((baseConfig.dailyLimit || 100) * 0.5), // Reduce limit by 50%
      recoveryMode: true,
      recoveryLevel: recoveryInfo.level,
      recoveryMultiplier: multiplier
    };
    
    logger.info(`🏥 [Recovery] Config adjusted for ${recoveryInfo.level} recovery: ${baseConfig.contactDelay?.min}-${baseConfig.contactDelay?.max}s → ${adjustedConfig.contactDelay.min}-${adjustedConfig.contactDelay.max}s`);
    
    return adjustedConfig;
  }

  /**
   * Get recommended pause based on health
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object>} Pause recommendation
   */
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

  /**
   * Schedule automatic recovery check
   * @param {string} sessionId - Session ID
   * @param {number} checkInterval - Check interval in ms (default 1 hour)
   */
  scheduleRecoveryCheck(sessionId, checkInterval = 3600000) {
    const intervalId = setInterval(async () => {
      try {
        const session = await BlastSession.findOne({ where: { sessionId } });
        
        // Stop checking if session ended
        if (!session || session.status === 'completed' || session.status === 'stopped') {
          clearInterval(intervalId);
          return;
        }
        
        // Check health and apply throttling
        const decision = await this.checkAndThrottle(sessionId);
        
        if (decision.shouldStop) {
          logger.warn(`🚨 [Recovery] Auto-stopping session ${sessionId} due to critical health (${decision.healthScore})`);
          // Trigger session stop (would need to integrate with blast controller)
        }
        
      } catch (error) {
        logger.error(`[Recovery] Error in scheduled check:`, error);
        clearInterval(intervalId);
      }
    }, checkInterval);
    
    logger.info(`🏥 [Recovery] Scheduled auto-recovery checks for session ${sessionId} every ${checkInterval/60000} minutes`);
    
    return intervalId;
  }

  /**
   * Start continuous monitoring for all active sessions
   */
  startContinuousMonitoring() {
    if (this.monitoringInterval) {
      logger.warn('[Recovery] Monitoring already active');
      return;
    }
    
    this.monitoringInterval = setInterval(async () => {
      try {
        // Get all active sessions
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
            // Would trigger actual session stop here
          }
        }
        
      } catch (error) {
        logger.error('[Recovery] Error in continuous monitoring:', error);
      }
    }, this.monitoringFrequency);
    
    logger.info(`🏥 [Recovery] Continuous monitoring started (check every ${this.monitoringFrequency/1000}s)`);
  }

  /**
   * Stop continuous monitoring
   */
  stopContinuousMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      logger.info('[Recovery] Continuous monitoring stopped');
    }
  }

  /**
   * Get account age in days
   * @param {string} accountAge - Account age category (NEW/WARMING/ESTABLISHED)
   * @returns {number} Days
   */
  getAccountAgeInDays(accountAge) {
    switch(accountAge) {
      case 'NEW': return 3;
      case 'WARMING': return 15;
      case 'ESTABLISHED': return 60;
      default: return 3;
    }
  }

  /**
   * Get recovery statistics
   * @returns {Object} Recovery stats
   */
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

  /**
   * Force exit recovery mode for a session
   * @param {string} sessionId - Session ID
   */
  async forceExitRecovery(sessionId) {
    await this.exitRecoveryMode(sessionId);
    logger.warn(`[Recovery] Forced exit from recovery mode for session ${sessionId}`);
  }

  /**
   * Reset all recovery states (for testing)
   */
  resetRecoveryStates() {
    this.recoverySessions.clear();
    this.pausedSessions.clear();
    logger.warn('[Recovery] All recovery states reset');
  }
}

// Singleton instance
let instance = null;

/**
 * Get singleton instance of RecoveryModeService
 * @returns {RecoveryModeService}
 */
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
