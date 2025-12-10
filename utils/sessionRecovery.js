const logger = require("./logger");
const BlastSession = require("../models/blastSessionModel");
const blastExecutionService = require("../services/blastExecutionService");
class SessionRecovery {
  async recoverActiveSessions() {
    try {
      logger.info("🔄 Starting session recovery after server restart...");
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
  async recoverSingleSession(session) {
    const { sessionId, status, config } = session;
    const businessHoursConfig = config?.businessHours || {};
    const shouldAutoResume = this.shouldAutoResumeSession(businessHoursConfig, status);
    if (shouldAutoResume) {
      logger.info(`🚀 Auto-resuming session: ${sessionId}`);
      await session.update({
        status: 'RUNNING',
        startedAt: new Date()
      });
      await blastExecutionService.startExecution(sessionId);
    } else {
      logger.info(`⏸️ Session ${sessionId} will remain paused (outside business hours)`);
      await session.update({
        status: 'PAUSED'
      });
    }
  }
  shouldAutoResumeSession(businessHoursConfig, currentStatus) {
    if (!businessHoursConfig || !businessHoursConfig.enabled) {
      return true;
    }
    return blastExecutionService.isWithinBusinessHours(businessHoursConfig);
  }
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
  calculateNextBusinessHoursStart(businessHoursConfig) {
    const now = new Date();
    const { startHour = 8, excludeWeekends = false } = businessHoursConfig;
    let nextStart = new Date();
    nextStart.setHours(startHour, 0, 0, 0);
    if (nextStart <= now) {
      nextStart.setDate(nextStart.getDate() + 1);
    }
    if (excludeWeekends) {
      while (nextStart.getDay() === 0 || nextStart.getDay() === 6) {
        nextStart.setDate(nextStart.getDate() + 1);
      }
    }
    return nextStart.getTime();
  }
  async cleanupOrphanedSessions() {
    try {
      logger.info("🧹 Cleaning up orphaned sessions...");
      const orphanedSessions = await BlastSession.findAll({
        where: {
          status: 'RUNNING',
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
