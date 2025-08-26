const logger = require("./logger");
const BlastSession = require("../models/blastSessionModel");
const blastExecutionService = require("../services/blastExecutionService");

/**
 * Session Recovery Utility
 * Handles recovery of sessions after server restart
 */
class SessionRecovery {
  
  /**
   * Recover all active sessions after server restart
   */
  async recoverActiveSessions() {
    try {
      logger.info("🔄 Starting session recovery after server restart...");
      
      // Find all sessions that were running or paused before restart
      const activeSessions = await BlastSession.findAll({
        where: {
          status: ['RUNNING', 'PAUSED']
        }
      });

      logger.info(`📊 Found ${activeSessions.length} active sessions to recover`);

      const recoveryResults = {
        recovered: 0,
        failed: 0,
        skipped: 0
      };

      for (const session of activeSessions) {
        try {
          await this.recoverSingleSession(session);
          recoveryResults.recovered++;
          logger.info(`✅ Recovered session: ${session.sessionId}`);
        } catch (error) {
          logger.error(`❌ Failed to recover session ${session.sessionId}:`, error);
          recoveryResults.failed++;
          
          // Mark session as error if recovery fails
          await session.update({
            status: 'ERROR',
            errorMessage: `Recovery failed: ${error.message}`,
            stoppedAt: new Date()
          });
        }
      }

      logger.info(`🎉 Session recovery completed: ${recoveryResults.recovered} recovered, ${recoveryResults.failed} failed`);
      return recoveryResults;
      
    } catch (error) {
      logger.error("❌ Session recovery failed:", error);
      throw error;
    }
  }

  /**
   * Recover a single session
   */
  async recoverSingleSession(session) {
    const { sessionId, status, config } = session;
    
    // Check if session should be auto-resumed
    const businessHoursConfig = config?.businessHours || {};
    const shouldAutoResume = this.shouldAutoResumeSession(businessHoursConfig, status);

    if (shouldAutoResume) {
      logger.info(`🚀 Auto-resuming session: ${sessionId}`);
      
      // Update status to RUNNING and restart execution
      await session.update({
        status: 'RUNNING',
        startedAt: new Date()
      });
      
      // Start execution service
      await blastExecutionService.startExecution(sessionId);
      
    } else {
      logger.info(`⏸️ Session ${sessionId} will remain paused (outside business hours)`);
      
      // Keep as PAUSED but ensure it's properly tracked
      await session.update({
        status: 'PAUSED'
      });
    }
  }

  /**
   * Check if session should be auto-resumed based on business hours
   */
  shouldAutoResumeSession(businessHoursConfig, currentStatus) {
    // If business hours not enabled, always resume
    if (!businessHoursConfig || !businessHoursConfig.enabled) {
      return true;
    }

    // Use the same business hours logic from execution service
    return blastExecutionService.isWithinBusinessHours(businessHoursConfig);
  }

  /**
   * Schedule next business hours check for paused sessions
   */
  async scheduleBusinessHoursCheck() {
    try {
      const pausedSessions = await BlastSession.findAll({
        where: { status: 'PAUSED' }
      });

      for (const session of pausedSessions) {
        const businessHoursConfig = session.config?.businessHours || {};
        
        if (businessHoursConfig.enabled) {
          const nextCheckTime = this.calculateNextBusinessHoursStart(businessHoursConfig);
          
          logger.info(`⏰ Session ${session.sessionId} scheduled to check at ${nextCheckTime}`);
          
          // Schedule check (you might want to use a proper job scheduler like node-cron)
          setTimeout(async () => {
            try {
              if (blastExecutionService.isWithinBusinessHours(businessHoursConfig)) {
                logger.info(`🚀 Auto-resuming session ${session.sessionId} - business hours started`);
                await blastExecutionService.startExecution(session.sessionId);
              }
            } catch (error) {
              logger.error(`❌ Failed to auto-resume session ${session.sessionId}:`, error);
            }
          }, nextCheckTime - Date.now());
        }
      }
    } catch (error) {
      logger.error("❌ Failed to schedule business hours check:", error);
    }
  }

  /**
   * Calculate next business hours start time
   */
  calculateNextBusinessHoursStart(businessHoursConfig) {
    const now = new Date();
    const { startHour = 8, excludeWeekends = false } = businessHoursConfig;
    
    let nextStart = new Date();
    nextStart.setHours(startHour, 0, 0, 0);
    
    // If start time has passed today, move to tomorrow
    if (nextStart <= now) {
      nextStart.setDate(nextStart.getDate() + 1);
    }
    
    // Skip weekends if configured
    if (excludeWeekends) {
      while (nextStart.getDay() === 0 || nextStart.getDay() === 6) {
        nextStart.setDate(nextStart.getDate() + 1);
      }
    }
    
    return nextStart.getTime();
  }

  /**
   * Clean up orphaned sessions (sessions stuck in RUNNING state)
   */
  async cleanupOrphanedSessions() {
    try {
      logger.info("🧹 Cleaning up orphaned sessions...");
      
      const orphanedSessions = await BlastSession.findAll({
        where: {
          status: 'RUNNING',
          // Sessions that have been running for more than 24 hours without update
          updatedAt: {
            [require('sequelize').Op.lt]: new Date(Date.now() - 24 * 60 * 60 * 1000)
          }
        }
      });

      for (const session of orphanedSessions) {
        logger.warn(`🚨 Found orphaned session: ${session.sessionId}`);
        
        await session.update({
          status: 'ERROR',
          errorMessage: 'Session orphaned after server restart',
          stoppedAt: new Date()
        });
      }

      logger.info(`🧹 Cleaned up ${orphanedSessions.length} orphaned sessions`);
      
    } catch (error) {
      logger.error("❌ Failed to cleanup orphaned sessions:", error);
    }
  }
}

module.exports = new SessionRecovery();