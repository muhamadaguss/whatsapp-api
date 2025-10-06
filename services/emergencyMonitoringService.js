const logger = require("../utils/logger");
const { Op } = require("sequelize");
const BlastSession = require("../models/blastSessionModel");
const BlastMessage = require("../models/blastMessageModel");

/**
 * ========== PHASE 1: EMERGENCY MONITORING SERVICE ==========
 * Real-time ban rate tracking and auto-pause protection
 * 
 * PURPOSE: Detect abnormal failure patterns and auto-pause campaigns
 * to prevent account bans before they happen.
 * 
 * KEY FEATURES:
 * - Ban rate calculation (failed messages / total sent)
 * - Session health scoring
 * - Auto-pause if ban rate > 5%
 * - Real-time alerts
 * - Historical trend analysis
 */

class EmergencyMonitoringService {
  constructor() {
    this.monitoringInterval = null;
    this.alertThresholds = {
      CRITICAL: 0.05,  // 5% ban rate = immediate pause
      WARNING: 0.03,   // 3% ban rate = alert only
      NORMAL: 0.01,    // 1% ban rate = acceptable
    };
  }

  /**
   * Calculate ban rate for a session
   * @param {string} sessionId - Session ID
   * @returns {Object} - Ban rate statistics
   */
  async calculateBanRate(sessionId) {
    try {
      const messages = await BlastMessage.findAll({
        where: { sessionId },
        attributes: ["status"],
      });

      const totalSent = messages.filter(m => 
        ["sent", "failed"].includes(m.status)
      ).length;

      const totalFailed = messages.filter(m => 
        m.status === "failed"
      ).length;

      const banRate = totalSent > 0 ? totalFailed / totalSent : 0;

      let severity = "NORMAL";
      if (banRate >= this.alertThresholds.CRITICAL) {
        severity = "CRITICAL";
      } else if (banRate >= this.alertThresholds.WARNING) {
        severity = "WARNING";
      }

      return {
        sessionId,
        totalSent,
        totalFailed,
        banRate: (banRate * 100).toFixed(2) + "%",
        banRateDecimal: banRate,
        severity,
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error(`❌ Failed to calculate ban rate for ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Check session health and auto-pause if needed
   * @param {string} sessionId - Session ID
   * @returns {Object} - Health check result
   */
  async checkSessionHealth(sessionId) {
    try {
      const session = await BlastSession.findOne({
        where: { sessionId },
      });

      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      // Skip if session is not running
      if (session.status !== "RUNNING") {
        return {
          sessionId,
          status: session.status,
          action: "SKIP",
          reason: "Session not running",
        };
      }

      // Calculate ban rate
      const banRateStats = await this.calculateBanRate(sessionId);

      // CRITICAL: Auto-pause if ban rate exceeds threshold
      if (banRateStats.severity === "CRITICAL") {
        logger.error(
          `🚨 CRITICAL BAN RATE DETECTED for ${sessionId}: ${banRateStats.banRate}`
        );

        // Pause session immediately
        await session.update({
          status: "PAUSED",
          pauseReason: `Auto-paused: Critical ban rate (${banRateStats.banRate})`,
          pausedAt: new Date(),
        });

        logger.warn(`⏸️ Session ${sessionId} auto-paused due to high ban rate`);

        return {
          sessionId,
          status: "PAUSED",
          action: "AUTO_PAUSED",
          reason: `Critical ban rate: ${banRateStats.banRate}`,
          banRateStats,
        };
      }

      // WARNING: Alert but don't pause yet
      if (banRateStats.severity === "WARNING") {
        logger.warn(
          `⚠️ WARNING: Elevated ban rate for ${sessionId}: ${banRateStats.banRate}`
        );

        return {
          sessionId,
          status: session.status,
          action: "ALERT",
          reason: `Warning ban rate: ${banRateStats.banRate}`,
          banRateStats,
        };
      }

      // NORMAL: All good
      return {
        sessionId,
        status: session.status,
        action: "HEALTHY",
        banRateStats,
      };
    } catch (error) {
      logger.error(`❌ Failed to check session health for ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Monitor all active sessions
   * @returns {Array} - Health check results for all sessions
   */
  async monitorActiveSessions() {
    try {
      const activeSessions = await BlastSession.findAll({
        where: {
          status: {
            [Op.in]: ["RUNNING", "PAUSED"],
          },
        },
      });

      if (activeSessions.length === 0) {
        logger.info("📊 No active sessions to monitor");
        return [];
      }

      logger.info(`📊 Monitoring ${activeSessions.length} active sessions`);

      const healthChecks = [];
      for (const session of activeSessions) {
        try {
          const health = await this.checkSessionHealth(session.sessionId);
          healthChecks.push(health);

          // Log critical actions
          if (health.action === "AUTO_PAUSED") {
            logger.error(`🚨 EMERGENCY: Session ${session.sessionId} auto-paused!`);
          }
        } catch (error) {
          logger.error(`❌ Failed to check ${session.sessionId}:`, error.message);
        }
      }

      return healthChecks;
    } catch (error) {
      logger.error("❌ Failed to monitor active sessions:", error);
      throw error;
    }
  }

  /**
   * Start continuous monitoring
   * @param {number} intervalMs - Monitoring interval in milliseconds
   */
  startMonitoring(intervalMs = 60000) {
    if (this.monitoringInterval) {
      logger.warn("⚠️ Monitoring already running");
      return;
    }

    logger.info(`🚀 Starting emergency monitoring (interval: ${intervalMs}ms)`);

    this.monitoringInterval = setInterval(async () => {
      try {
        await this.monitorActiveSessions();
      } catch (error) {
        logger.error("❌ Monitoring cycle failed:", error);
      }
    }, intervalMs);
  }

  /**
   * Stop continuous monitoring
   */
  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      logger.info("⏹️ Emergency monitoring stopped");
    }
  }

  /**
   * Get session statistics summary
   * @param {string} sessionId - Session ID
   * @returns {Object} - Session statistics
   */
  async getSessionStats(sessionId) {
    try {
      const messages = await BlastMessage.findAll({
        where: { sessionId },
      });

      const stats = {
        total: messages.length,
        pending: messages.filter(m => m.status === "pending").length,
        processing: messages.filter(m => m.status === "processing").length,
        sent: messages.filter(m => m.status === "sent").length,
        failed: messages.filter(m => m.status === "failed").length,
        skipped: messages.filter(m => m.status === "skipped").length,
      };

      stats.successRate = stats.total > 0 
        ? ((stats.sent / (stats.sent + stats.failed)) * 100).toFixed(2) + "%"
        : "0%";

      return stats;
    } catch (error) {
      logger.error(`❌ Failed to get session stats for ${sessionId}:`, error);
      throw error;
    }
  }
}

// Export singleton instance
module.exports = new EmergencyMonitoringService();
