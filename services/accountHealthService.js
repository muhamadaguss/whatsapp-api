/**
 * Account Health Service
 * 
 * Monitors and tracks WhatsApp account health metrics
 * Provides comprehensive health scoring and recommendations
 * 
 * Health Metrics:
 * 1. Connection Quality (30% weight)
 * 2. Success Rate (35% weight)
 * 3. Daily Usage vs Limit (20% weight)
 * 4. Failure Rate (15% weight)
 * 
 * @module accountHealthService
 */

const logger = require("../utils/logger");
const BlastSession = require("../models/blastSessionModel");
const BlastMessage = require("../models/blastMessageModel");
const { getSocket } = require("../auth/socket");

class AccountHealthService {
  constructor() {
    this.healthCache = new Map(); // Cache health calculations
    this.healthHistory = new Map(); // Store 30-day health history
    this.warningLog = new Map(); // Log health warnings
  }

  /**
   * Calculate comprehensive health score for an account
   * @param {string} sessionId - WhatsApp session ID
   * @param {number} accountAge - Account age in days
   * @returns {Promise<Object>} Health assessment
   */
  async calculateAccountHealth(sessionId, accountAge = 30) {
    try {
      // Get account statistics
      const stats = await this.getAccountStatistics(sessionId);
      
      // Calculate individual health components
      const connectionHealth = this.calculateConnectionHealth(stats);
      const successRateHealth = this.calculateSuccessRateHealth(stats);
      const usageHealth = this.calculateUsageHealth(stats, accountAge);
      const failureRateHealth = this.calculateFailureRateHealth(stats);

      // Calculate weighted overall health score (0-100)
      const healthScore = Math.round(
        connectionHealth.score * 0.30 +
        successRateHealth.score * 0.35 +
        usageHealth.score * 0.20 +
        failureRateHealth.score * 0.15
      );

      // Determine health level
      const healthLevel = this.getHealthLevel(healthScore);

      // Get all warnings
      const warnings = [
        ...connectionHealth.warnings,
        ...successRateHealth.warnings,
        ...usageHealth.warnings,
        ...failureRateHealth.warnings,
      ];

      // Generate recommendations
      const recommendations = this.generateHealthRecommendations(
        healthScore,
        warnings,
        stats,
        accountAge
      );

      // Determine if action needed
      const actionRequired = this.determineActionRequired(healthScore, warnings);

      const assessment = {
        sessionId,
        timestamp: new Date(),
        healthScore,
        healthLevel,
        accountAge,
        components: {
          connection: connectionHealth,
          successRate: successRateHealth,
          usage: usageHealth,
          failureRate: failureRateHealth,
        },
        warnings,
        recommendations,
        actionRequired,
        statistics: stats,
        trends: this.calculateTrends(sessionId, healthScore),
      };

      // Cache the assessment
      this.healthCache.set(sessionId, assessment);

      // Add to history
      this.addToHistory(sessionId, assessment);

      // Emit socket event
      this.emitHealthUpdate(assessment);

      // Log warnings if health is poor
      if (healthScore < 60) {
        this.logWarning(sessionId, healthScore, warnings);
      }

      return assessment;
    } catch (error) {
      logger.error(`Error calculating account health for ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Get account statistics from database
   */
  async getAccountStatistics(sessionId) {
    // Get last 7 days of blast sessions for this account
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const sessions = await BlastSession.find({
      sessionId,
      createdAt: { $gte: sevenDaysAgo },
    }).sort({ createdAt: -1 });

    // Get all messages from these sessions
    const sessionIds = sessions.map(s => s._id);
    const messages = await BlastMessage.find({
      blastSessionId: { $in: sessionIds },
    });

    // Calculate statistics
    const totalMessages = messages.length;
    const sentMessages = messages.filter(m => m.status === 'sent').length;
    const failedMessages = messages.filter(m => m.status === 'failed').length;
    const deliveredMessages = messages.filter(m => m.deliveredAt).length;

    const successRate = totalMessages > 0 ? (sentMessages / totalMessages) * 100 : 0;
    const failureRate = totalMessages > 0 ? (failedMessages / totalMessages) * 100 : 0;
    const deliveryRate = sentMessages > 0 ? (deliveredMessages / sentMessages) * 100 : 0;

    // Get today's usage
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMessages = messages.filter(m => {
      const msgDate = new Date(m.createdAt);
      msgDate.setHours(0, 0, 0, 0);
      return msgDate.getTime() === today.getTime();
    });

    const dailyUsage = todayMessages.length;
    const dailyLimit = 300; // Default limit

    // Calculate average daily usage (last 7 days)
    const dailyAverage = Math.round(totalMessages / 7);

    // Get connection quality metrics
    const recentSession = sessions[0];
    const connectionQuality = recentSession?.connectionQuality || 'unknown';
    const lastActive = recentSession?.lastActiveAt || recentSession?.updatedAt;

    // Calculate response times
    const responseTimes = messages
      .filter(m => m.sentAt && m.deliveredAt)
      .map(m => new Date(m.deliveredAt) - new Date(m.sentAt));
    
    const avgResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : 0;

    // Get error patterns
    const errorTypes = {};
    messages
      .filter(m => m.status === 'failed' && m.error)
      .forEach(m => {
        const errorType = m.error.type || 'unknown';
        errorTypes[errorType] = (errorTypes[errorType] || 0) + 1;
      });

    return {
      totalMessages,
      sentMessages,
      failedMessages,
      deliveredMessages,
      successRate,
      failureRate,
      deliveryRate,
      dailyUsage,
      dailyLimit,
      dailyAverage,
      connectionQuality,
      lastActive,
      avgResponseTime,
      errorTypes,
      sessionsCount: sessions.length,
    };
  }

  /**
   * Calculate connection health (0-100)
   * Weight: 30%
   */
  calculateConnectionHealth(stats) {
    const warnings = [];
    let score = 100;

    // Check connection quality
    if (stats.connectionQuality === 'poor') {
      score = 30;
      warnings.push({
        severity: 'high',
        type: 'connection_poor',
        message: 'Poor connection quality detected',
        recommendation: 'Check internet connection and restart session',
      });
    } else if (stats.connectionQuality === 'unstable') {
      score = 60;
      warnings.push({
        severity: 'medium',
        type: 'connection_unstable',
        message: 'Unstable connection detected',
        recommendation: 'Monitor connection quality closely',
      });
    } else if (stats.connectionQuality === 'unknown') {
      score = 80;
      warnings.push({
        severity: 'low',
        type: 'connection_unknown',
        message: 'Connection quality unknown',
        recommendation: 'Verify account is properly connected',
      });
    }

    // Check last active time
    if (stats.lastActive) {
      const hoursSinceActive = (Date.now() - new Date(stats.lastActive)) / (1000 * 60 * 60);
      
      if (hoursSinceActive > 24) {
        score = Math.min(score, 40);
        warnings.push({
          severity: 'high',
          type: 'inactive_long',
          message: `Account inactive for ${Math.round(hoursSinceActive)} hours`,
          recommendation: 'Reconnect account immediately',
        });
      } else if (hoursSinceActive > 6) {
        score = Math.min(score, 70);
        warnings.push({
          severity: 'medium',
          type: 'inactive_moderate',
          message: `Account inactive for ${Math.round(hoursSinceActive)} hours`,
          recommendation: 'Check account status',
        });
      }
    }

    // Check delivery rate
    if (stats.deliveryRate < 50) {
      score = Math.min(score, 40);
      warnings.push({
        severity: 'high',
        type: 'low_delivery',
        message: `Low delivery rate: ${stats.deliveryRate.toFixed(1)}%`,
        recommendation: 'Messages not reaching recipients - investigate urgently',
      });
    } else if (stats.deliveryRate < 80) {
      score = Math.min(score, 70);
      warnings.push({
        severity: 'medium',
        type: 'moderate_delivery',
        message: `Moderate delivery rate: ${stats.deliveryRate.toFixed(1)}%`,
        recommendation: 'Monitor delivery issues',
      });
    }

    return { 
      score, 
      warnings, 
      value: stats.connectionQuality,
      deliveryRate: stats.deliveryRate,
    };
  }

  /**
   * Calculate success rate health (0-100)
   * Weight: 35%
   */
  calculateSuccessRateHealth(stats) {
    const warnings = [];
    let score = Math.round(stats.successRate);

    if (stats.successRate < 50) {
      warnings.push({
        severity: 'critical',
        type: 'very_low_success',
        message: `Very low success rate: ${stats.successRate.toFixed(1)}%`,
        recommendation: 'Stop campaigns and investigate immediately',
      });
    } else if (stats.successRate < 70) {
      warnings.push({
        severity: 'high',
        type: 'low_success',
        message: `Low success rate: ${stats.successRate.toFixed(1)}%`,
        recommendation: 'Review message content and account settings',
      });
    } else if (stats.successRate < 85) {
      warnings.push({
        severity: 'medium',
        type: 'moderate_success',
        message: `Moderate success rate: ${stats.successRate.toFixed(1)}%`,
        recommendation: 'Monitor and optimize campaign settings',
      });
    }

    return { 
      score, 
      warnings, 
      value: stats.successRate,
    };
  }

  /**
   * Calculate usage health (0-100)
   * Weight: 20%
   */
  calculateUsageHealth(stats, accountAge) {
    const warnings = [];
    let score = 100;

    // Calculate safe usage percentage based on account age
    let safeLimit = 200; // Default for established accounts
    
    if (accountAge < 7) {
      safeLimit = 100; // New account
    } else if (accountAge < 30) {
      safeLimit = 150; // Warming account
    }

    const usagePercentage = (stats.dailyUsage / safeLimit) * 100;

    if (usagePercentage > 100) {
      score = 20;
      warnings.push({
        severity: 'critical',
        type: 'over_limit',
        message: `Exceeded safe daily limit: ${stats.dailyUsage}/${safeLimit} messages`,
        recommendation: 'Stop sending immediately - risk of ban',
      });
    } else if (usagePercentage > 90) {
      score = 40;
      warnings.push({
        severity: 'high',
        type: 'near_limit',
        message: `Near daily limit: ${stats.dailyUsage}/${safeLimit} messages (${usagePercentage.toFixed(1)}%)`,
        recommendation: 'Slow down or stop for today',
      });
    } else if (usagePercentage > 75) {
      score = 70;
      warnings.push({
        severity: 'medium',
        type: 'high_usage',
        message: `High daily usage: ${usagePercentage.toFixed(1)}% of safe limit`,
        recommendation: 'Monitor usage carefully',
      });
    } else {
      score = 100 - (usagePercentage * 0.3); // Slight reduction as usage increases
    }

    return { 
      score, 
      warnings, 
      value: stats.dailyUsage,
      limit: safeLimit,
      percentage: usagePercentage,
    };
  }

  /**
   * Calculate failure rate health (0-100)
   * Weight: 15%
   */
  calculateFailureRateHealth(stats) {
    const warnings = [];
    let score = 100 - (stats.failureRate * 2); // Each 1% failure = -2 points
    score = Math.max(0, Math.min(100, score));

    if (stats.failureRate > 30) {
      warnings.push({
        severity: 'critical',
        type: 'very_high_failure',
        message: `Very high failure rate: ${stats.failureRate.toFixed(1)}%`,
        recommendation: 'Account may be flagged - stop immediately',
      });
    } else if (stats.failureRate > 20) {
      warnings.push({
        severity: 'high',
        type: 'high_failure',
        message: `High failure rate: ${stats.failureRate.toFixed(1)}%`,
        recommendation: 'Investigate and reduce sending',
      });
    } else if (stats.failureRate > 10) {
      warnings.push({
        severity: 'medium',
        type: 'moderate_failure',
        message: `Moderate failure rate: ${stats.failureRate.toFixed(1)}%`,
        recommendation: 'Monitor failure patterns',
      });
    }

    // Check for specific error patterns
    if (stats.errorTypes['rate_limit']) {
      warnings.push({
        severity: 'high',
        type: 'rate_limited',
        message: 'Rate limiting detected',
        recommendation: 'Reduce sending speed immediately',
      });
    }

    if (stats.errorTypes['banned'] || stats.errorTypes['blocked']) {
      warnings.push({
        severity: 'critical',
        type: 'account_restricted',
        message: 'Account restrictions detected',
        recommendation: 'Stop all activity - account may be banned',
      });
    }

    return { 
      score, 
      warnings, 
      value: stats.failureRate,
      errorTypes: stats.errorTypes,
    };
  }

  /**
   * Determine overall health level
   */
  getHealthLevel(score) {
    if (score >= 85) return 'excellent';
    if (score >= 70) return 'good';
    if (score >= 50) return 'moderate';
    if (score >= 30) return 'poor';
    return 'critical';
  }

  /**
   * Generate health-based recommendations
   */
  generateHealthRecommendations(healthScore, warnings, stats, accountAge) {
    const recommendations = [];

    // Sort warnings by severity
    const sortedWarnings = warnings.sort((a, b) => {
      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    });

    // Add recommendations from warnings
    sortedWarnings.slice(0, 5).forEach(warning => {
      recommendations.push({
        priority: warning.severity,
        title: warning.message,
        action: warning.recommendation,
        type: warning.type,
      });
    });

    // Add proactive recommendations based on health level
    if (healthScore >= 85) {
      recommendations.push({
        priority: 'low',
        title: 'Excellent health - maintain current practices',
        action: 'Continue monitoring and keep current settings',
        type: 'proactive',
      });
    } else if (healthScore < 50) {
      recommendations.unshift({
        priority: 'critical',
        title: 'CRITICAL: Account health is poor',
        action: 'Rest account for 24-48 hours and review all settings',
        type: 'urgent',
      });
    }

    // Account age specific recommendations
    if (accountAge < 7 && stats.dailyUsage > 100) {
      recommendations.push({
        priority: 'high',
        title: 'New account - reduce volume',
        action: 'Limit to 50-80 messages per day for new accounts',
        type: 'account_age',
      });
    }

    return recommendations;
  }

  /**
   * Determine if immediate action required
   */
  determineActionRequired(healthScore, warnings) {
    const criticalWarnings = warnings.filter(w => w.severity === 'critical');
    
    if (healthScore < 30 || criticalWarnings.length >= 2) {
      return {
        required: true,
        urgency: 'critical',
        action: 'rest',
        duration: '48 hours',
        reason: 'Critical health issues detected',
      };
    }

    if (healthScore < 50) {
      return {
        required: true,
        urgency: 'high',
        action: 'rest',
        duration: '24 hours',
        reason: 'Poor health - account needs recovery',
      };
    }

    if (healthScore < 70) {
      return {
        required: true,
        urgency: 'medium',
        action: 'reduce',
        percentage: 50,
        reason: 'Moderate health - reduce activity',
      };
    }

    return {
      required: false,
      urgency: 'low',
      action: 'monitor',
      reason: 'Health acceptable',
    };
  }

  /**
   * Calculate health trends
   */
  calculateTrends(sessionId, currentScore) {
    const history = this.healthHistory.get(sessionId) || [];
    
    if (history.length < 2) {
      return {
        direction: 'stable',
        change: 0,
        dataPoints: history.length,
      };
    }

    // Get last 7 days average
    const recentHistory = history.slice(-7);
    const averageScore = recentHistory.reduce((sum, h) => sum + h.healthScore, 0) / recentHistory.length;
    
    const change = currentScore - averageScore;
    let direction = 'stable';
    
    if (change > 5) direction = 'improving';
    else if (change < -5) direction = 'declining';

    return {
      direction,
      change: Math.round(change),
      averageScore: Math.round(averageScore),
      dataPoints: history.length,
    };
  }

  /**
   * Add assessment to history
   */
  addToHistory(sessionId, assessment) {
    if (!this.healthHistory.has(sessionId)) {
      this.healthHistory.set(sessionId, []);
    }

    const history = this.healthHistory.get(sessionId);
    history.push({
      timestamp: assessment.timestamp,
      healthScore: assessment.healthScore,
      healthLevel: assessment.healthLevel,
      warningCount: assessment.warnings.length,
    });

    // Keep only last 30 days (assuming 4 checks per day = 120 entries)
    if (history.length > 120) {
      history.shift();
    }
  }

  /**
   * Get health history for a session
   */
  getHealthHistory(sessionId, days = 7) {
    const history = this.healthHistory.get(sessionId) || [];
    const entriesPerDay = 4; // Assuming 4 health checks per day
    const limit = days * entriesPerDay;
    return history.slice(-limit);
  }

  /**
   * Log health warning
   */
  logWarning(sessionId, healthScore, warnings) {
    if (!this.warningLog.has(sessionId)) {
      this.warningLog.set(sessionId, []);
    }

    const criticalWarnings = warnings.filter(w => w.severity === 'critical' || w.severity === 'high');
    
    if (criticalWarnings.length > 0) {
      this.warningLog.get(sessionId).push({
        timestamp: new Date(),
        healthScore,
        warnings: criticalWarnings,
      });

      logger.warn(`⚠️ Health warning for ${sessionId}: Score ${healthScore}, ${criticalWarnings.length} critical issues`);
    }
  }

  /**
   * Get warning log
   */
  getWarningLog(sessionId) {
    return this.warningLog.get(sessionId) || [];
  }

  /**
   * Emit health update via WebSocket
   */
  emitHealthUpdate(assessment) {
    try {
      const io = getSocket();
      if (io) {
        io.emit('account-health-update', {
          sessionId: assessment.sessionId,
          healthScore: assessment.healthScore,
          healthLevel: assessment.healthLevel,
          timestamp: assessment.timestamp,
          warnings: assessment.warnings.length,
          actionRequired: assessment.actionRequired,
        });

        logger.debug(`📡 Health update emitted for ${assessment.sessionId}: ${assessment.healthLevel} (${assessment.healthScore})`);
      }
    } catch (error) {
      logger.warn('⚠️ Failed to emit health update:', error.message);
    }
  }

  /**
   * Clear cache for a session
   */
  clearCache(sessionId) {
    this.healthCache.delete(sessionId);
  }

  /**
   * Get cached assessment
   */
  getCachedHealth(sessionId) {
    return this.healthCache.get(sessionId);
  }

  /**
   * Execute health action (rest, reduce, etc.)
   */
  async executeHealthAction(sessionId, action, options = {}) {
    try {
      const session = await BlastSession.findOne({ sessionId }).sort({ createdAt: -1 });
      
      if (!session) {
        throw new Error('Session not found');
      }

      let result = {};

      switch (action) {
        case 'rest':
          const duration = options.duration || 24; // hours
          const restUntil = new Date(Date.now() + duration * 60 * 60 * 1000);
          
          result = {
            action: 'rest',
            restUntil,
            message: `Account resting for ${duration} hours`,
          };
          
          logger.info(`🛌 Account ${sessionId} entering rest mode until ${restUntil}`);
          break;

        case 'reduce':
          const percentage = options.percentage || 50;
          result = {
            action: 'reduce',
            percentage,
            message: `Reduce activity by ${percentage}%`,
          };
          
          logger.info(`📉 Account ${sessionId} reducing activity by ${percentage}%`);
          break;

        case 'reconnect':
          result = {
            action: 'reconnect',
            message: 'Reconnect account recommended',
          };
          
          logger.info(`🔄 Account ${sessionId} needs reconnection`);
          break;

        default:
          throw new Error(`Unknown action: ${action}`);
      }

      return result;
    } catch (error) {
      logger.error(`Error executing health action for ${sessionId}:`, error);
      throw error;
    }
  }
}

// Export singleton instance
module.exports = new AccountHealthService();
