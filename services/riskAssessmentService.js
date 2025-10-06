/**
 * Risk Assessment Service
 * 
 * Calculates real-time risk scores for blast sessions
 * Monitors dangerous patterns and provides recommendations
 * 
 * Risk Factors:
 * 1. Failure Rate (35% weight)
 * 2. Send Velocity (25% weight) 
 * 3. Account Status (20% weight)
 * 4. Message Patterns (10% weight)
 * 5. Time-based Risks (10% weight)
 * 
 * @module riskAssessmentService
 */

const logger = require("../utils/logger");
const BlastSession = require("../models/blastSessionModel");
const BlastMessage = require("../models/blastMessageModel");
const { getSocket } = require("../auth/socket");

class RiskAssessmentService {
  constructor() {
    this.riskCache = new Map(); // Cache risk calculations
    this.riskHistory = new Map(); // Store historical risk data
    this.autoActionLog = new Map(); // Log auto-actions taken
  }

  /**
   * Calculate comprehensive risk assessment for a blast session
   * @param {string} sessionId - Blast session ID
   * @returns {Promise<Object>} Risk assessment result
   */
  async calculateRiskAssessment(sessionId) {
    try {
      const session = await BlastSession.findOne({ where: { sessionId } });
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      // Get message statistics
      const stats = await this.getSessionStatistics(sessionId);
      
      // Calculate individual risk factors
      const failureRisk = this.calculateFailureRisk(stats);
      const velocityRisk = this.calculateVelocityRisk(stats, session);
      const accountRisk = this.calculateAccountRisk(session);
      const patternRisk = this.calculatePatternRisk(stats);
      const timeRisk = this.calculateTimeRisk(session);

      // Calculate weighted overall risk score (0-100)
      const riskScore = Math.round(
        failureRisk.score * 0.35 +
        velocityRisk.score * 0.25 +
        accountRisk.score * 0.20 +
        patternRisk.score * 0.10 +
        timeRisk.score * 0.10
      );

      // Determine risk level
      const riskLevel = this.getRiskLevel(riskScore);

      // Get all detected issues
      const detectedIssues = [
        ...failureRisk.issues,
        ...velocityRisk.issues,
        ...accountRisk.issues,
        ...patternRisk.issues,
        ...timeRisk.issues,
      ];

      // Generate recommendations
      const recommendations = this.generateRecommendations(
        riskScore,
        detectedIssues,
        stats,
        session
      );

      // Determine if auto-action needed
      const autoAction = this.determineAutoAction(riskScore, detectedIssues, session);

      const assessment = {
        sessionId,
        timestamp: new Date(),
        riskScore,
        riskLevel,
        factors: {
          failureRate: failureRisk,
          velocity: velocityRisk,
          account: accountRisk,
          patterns: patternRisk,
          timing: timeRisk,
        },
        detectedIssues,
        recommendations,
        autoAction,
        statistics: stats,
      };

      // Cache the assessment
      this.riskCache.set(sessionId, assessment);

      // Store in history
      this.addToHistory(sessionId, assessment);

      // Emit socket event for real-time updates
      this.emitRiskUpdate(assessment);

      return assessment;
    } catch (error) {
      logger.error(`Error calculating risk assessment for ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Get session statistics from database
   */
  async getSessionStatistics(sessionId) {
    const messages = await BlastMessage.find({ blastSessionId: sessionId });
    
    const total = messages.length;
    const sent = messages.filter(m => m.status === 'sent').length;
    const failed = messages.filter(m => m.status === 'failed').length;
    const pending = messages.filter(m => m.status === 'pending').length;
    
    // Calculate rates
    const failureRate = total > 0 ? (failed / total) * 100 : 0;
    const successRate = total > 0 ? (sent / total) * 100 : 0;

    // Get consecutive failures
    let consecutiveFailures = 0;
    let maxConsecutiveFailures = 0;
    let currentStreak = 0;

    messages
      .sort((a, b) => new Date(a.sentAt || a.createdAt) - new Date(b.sentAt || b.createdAt))
      .forEach(msg => {
        if (msg.status === 'failed') {
          currentStreak++;
          maxConsecutiveFailures = Math.max(maxConsecutiveFailures, currentStreak);
        } else if (msg.status === 'sent') {
          currentStreak = 0;
        }
      });
    
    consecutiveFailures = currentStreak;

    // Calculate send velocity (messages per minute)
    const sentMessages = messages.filter(m => m.sentAt);
    let velocity = 0;
    
    if (sentMessages.length > 1) {
      const firstSent = new Date(sentMessages[0].sentAt);
      const lastSent = new Date(sentMessages[sentMessages.length - 1].sentAt);
      const durationMinutes = (lastSent - firstSent) / (1000 * 60);
      velocity = durationMinutes > 0 ? sentMessages.length / durationMinutes : 0;
    }

    // Calculate average response time
    const responseTimes = messages
      .filter(m => m.sentAt && m.deliveredAt)
      .map(m => new Date(m.deliveredAt) - new Date(m.sentAt));
    
    const avgResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : 0;

    return {
      total,
      sent,
      failed,
      pending,
      failureRate,
      successRate,
      consecutiveFailures,
      maxConsecutiveFailures,
      velocity,
      avgResponseTime,
    };
  }

  /**
   * Calculate failure rate risk (0-100)
   * Weight: 35%
   */
  calculateFailureRisk(stats) {
    const issues = [];
    let score = 0;

    // Failure rate thresholds
    if (stats.failureRate >= 50) {
      score = 100; // Critical
      issues.push({
        severity: 'critical',
        type: 'failure_rate',
        message: `Extremely high failure rate: ${stats.failureRate.toFixed(1)}%`,
        recommendation: 'Stop campaign immediately and investigate',
      });
    } else if (stats.failureRate >= 30) {
      score = 80; // High
      issues.push({
        severity: 'high',
        type: 'failure_rate',
        message: `High failure rate: ${stats.failureRate.toFixed(1)}%`,
        recommendation: 'Pause and review account status',
      });
    } else if (stats.failureRate >= 20) {
      score = 50; // Medium
      issues.push({
        severity: 'medium',
        type: 'failure_rate',
        message: `Moderate failure rate: ${stats.failureRate.toFixed(1)}%`,
        recommendation: 'Monitor closely, consider slowing down',
      });
    } else if (stats.failureRate >= 10) {
      score = 25; // Low
      issues.push({
        severity: 'low',
        type: 'failure_rate',
        message: `Elevated failure rate: ${stats.failureRate.toFixed(1)}%`,
        recommendation: 'Keep monitoring',
      });
    } else {
      score = 0; // Safe
    }

    // Consecutive failures check
    if (stats.consecutiveFailures >= 15) {
      score = Math.max(score, 90);
      issues.push({
        severity: 'critical',
        type: 'consecutive_failures',
        message: `${stats.consecutiveFailures} consecutive failures detected`,
        recommendation: 'Auto-pause recommended',
      });
    } else if (stats.consecutiveFailures >= 10) {
      score = Math.max(score, 60);
      issues.push({
        severity: 'high',
        type: 'consecutive_failures',
        message: `${stats.consecutiveFailures} consecutive failures`,
        recommendation: 'Investigate connection issues',
      });
    }

    return { score, issues, value: stats.failureRate };
  }

  /**
   * Calculate send velocity risk (0-100)
   * Weight: 25%
   */
  calculateVelocityRisk(stats, session) {
    const issues = [];
    let score = 0;

    const velocity = stats.velocity;

    // Get recommended velocity based on account config
    const maxSafeVelocity = 3; // 3 messages per minute = safe
    const accountAge = session.accountAge || 30; // days
    
    let recommendedVelocity = maxSafeVelocity;
    if (accountAge < 7) {
      recommendedVelocity = 1.5; // New account - very slow
    } else if (accountAge < 30) {
      recommendedVelocity = 2.5; // Warming - moderate
    }

    if (velocity > recommendedVelocity * 2) {
      score = 100; // Critical - way too fast
      issues.push({
        severity: 'critical',
        type: 'velocity',
        message: `Sending too fast: ${velocity.toFixed(2)} msg/min (limit: ${recommendedVelocity})`,
        recommendation: 'Reduce sending speed immediately',
      });
    } else if (velocity > recommendedVelocity * 1.5) {
      score = 70; // High
      issues.push({
        severity: 'high',
        type: 'velocity',
        message: `Sending speed high: ${velocity.toFixed(2)} msg/min`,
        recommendation: 'Slow down to avoid detection',
      });
    } else if (velocity > recommendedVelocity) {
      score = 40; // Medium
      issues.push({
        severity: 'medium',
        type: 'velocity',
        message: `Sending speed above recommended: ${velocity.toFixed(2)} msg/min`,
        recommendation: 'Consider increasing delays',
      });
    } else {
      score = 0; // Safe
    }

    return { score, issues, value: velocity, recommended: recommendedVelocity };
  }

  /**
   * Calculate account status risk (0-100)
   * Weight: 20%
   */
  calculateAccountRisk(session) {
    const issues = [];
    let score = 0;

    // Check account age
    const accountAge = session.accountAge || 0;
    
    if (accountAge < 3) {
      score = 80; // Very new account - high risk
      issues.push({
        severity: 'high',
        type: 'account_age',
        message: `Very new account (${accountAge} days old)`,
        recommendation: 'Use ultra-conservative settings',
      });
    } else if (accountAge < 7) {
      score = 50; // New account
      issues.push({
        severity: 'medium',
        type: 'account_age',
        message: `New account (${accountAge} days old)`,
        recommendation: 'Keep limits low and delays high',
      });
    } else if (accountAge < 30) {
      score = 25; // Warming phase
      issues.push({
        severity: 'low',
        type: 'account_age',
        message: `Warming account (${accountAge} days old)`,
        recommendation: 'Gradually increase volume',
      });
    }

    // Check if account is connected
    // This would need integration with whatsapp session status
    // For now, assume connected if session exists

    return { score, issues, value: accountAge };
  }

  /**
   * Calculate message pattern risk (0-100)
   * Weight: 10%
   */
  calculatePatternRisk(stats) {
    const issues = [];
    let score = 0;

    // Check for suspicious patterns
    // This is where spam detection from frontend would integrate
    
    // For now, basic checks
    if (stats.avgResponseTime > 30000) { // >30 seconds avg response
      score = 40;
      issues.push({
        severity: 'medium',
        type: 'slow_response',
        message: 'Slow message delivery detected',
        recommendation: 'Check network connection',
      });
    }

    return { score, issues, value: stats.avgResponseTime };
  }

  /**
   * Calculate time-based risk (0-100)
   * Weight: 10%
   */
  calculateTimeRisk(session) {
    const issues = [];
    let score = 0;

    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay(); // 0 = Sunday

    // Check if sending outside business hours
    const config = session.config || {};
    const businessHoursEnabled = config.respectBusinessHours !== false;
    
    if (businessHoursEnabled) {
      const startHour = config.businessHoursStart || 9;
      const endHour = config.businessHoursEnd || 17;
      
      if (hour < startHour || hour >= endHour) {
        score = 60;
        issues.push({
          severity: 'medium',
          type: 'outside_hours',
          message: `Sending outside business hours (${hour}:00)`,
          recommendation: 'Schedule for business hours',
        });
      }
    }

    // Check if weekend
    if (day === 0 || day === 6) { // Sunday or Saturday
      score = Math.max(score, 30);
      issues.push({
        severity: 'low',
        type: 'weekend',
        message: 'Sending on weekend',
        recommendation: 'Weekday campaigns typically perform better',
      });
    }

    return { score, issues, value: hour };
  }

  /**
   * Determine overall risk level from score
   */
  getRiskLevel(score) {
    if (score >= 80) return 'critical';
    if (score >= 60) return 'high';
    if (score >= 40) return 'medium';
    if (score >= 20) return 'low';
    return 'safe';
  }

  /**
   * Generate actionable recommendations
   */
  generateRecommendations(riskScore, issues, stats, session) {
    const recommendations = [];

    // Sort issues by severity
    const sortedIssues = issues.sort((a, b) => {
      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    });

    // Add recommendations from issues
    sortedIssues.slice(0, 5).forEach(issue => {
      recommendations.push({
        priority: issue.severity,
        title: issue.message,
        action: issue.recommendation,
        type: issue.type,
      });
    });

    // Add general recommendations based on risk level
    if (riskScore >= 80) {
      recommendations.unshift({
        priority: 'critical',
        title: 'CRITICAL RISK DETECTED',
        action: 'Pause or stop campaign immediately and review all settings',
        type: 'general',
      });
    } else if (riskScore >= 60 && stats.failureRate < 20) {
      recommendations.push({
        priority: 'high',
        title: 'Multiple risk factors detected',
        action: 'Review account health and campaign settings',
        type: 'general',
      });
    }

    return recommendations;
  }

  /**
   * Determine if automatic action should be taken
   */
  determineAutoAction(riskScore, issues, session) {
    const criticalIssues = issues.filter(i => i.severity === 'critical');
    
    if (riskScore >= 90 || criticalIssues.length >= 2) {
      return {
        recommended: true,
        action: 'stop',
        reason: 'Critical risk level detected',
        severity: 'critical',
      };
    }

    if (riskScore >= 70) {
      return {
        recommended: true,
        action: 'pause',
        reason: 'High risk level detected',
        severity: 'high',
      };
    }

    if (riskScore >= 60) {
      return {
        recommended: true,
        action: 'slow_down',
        reason: 'Elevated risk level detected',
        severity: 'medium',
      };
    }

    return {
      recommended: false,
      action: 'none',
      reason: 'Risk level acceptable',
      severity: 'low',
    };
  }

  /**
   * Add assessment to history
   */
  addToHistory(sessionId, assessment) {
    if (!this.riskHistory.has(sessionId)) {
      this.riskHistory.set(sessionId, []);
    }

    const history = this.riskHistory.get(sessionId);
    history.push({
      timestamp: assessment.timestamp,
      riskScore: assessment.riskScore,
      riskLevel: assessment.riskLevel,
      issueCount: assessment.detectedIssues.length,
    });

    // Keep only last 100 entries
    if (history.length > 100) {
      history.shift();
    }
  }

  /**
   * Get risk history for a session
   */
  getRiskHistory(sessionId, limit = 50) {
    const history = this.riskHistory.get(sessionId) || [];
    return history.slice(-limit);
  }

  /**
   * Log auto-action taken
   */
  logAutoAction(sessionId, action, reason) {
    if (!this.autoActionLog.has(sessionId)) {
      this.autoActionLog.set(sessionId, []);
    }

    this.autoActionLog.get(sessionId).push({
      timestamp: new Date(),
      action,
      reason,
    });

    logger.info(`🛡️ Auto-action logged for ${sessionId}: ${action} - ${reason}`);
  }

  /**
   * Get auto-action log
   */
  getAutoActionLog(sessionId) {
    return this.autoActionLog.get(sessionId) || [];
  }

  /**
   * Emit risk update via WebSocket
   */
  emitRiskUpdate(assessment) {
    try {
      const io = getSocket();
      if (io) {
        io.emit('risk-assessment-update', {
          sessionId: assessment.sessionId,
          riskScore: assessment.riskScore,
          riskLevel: assessment.riskLevel,
          timestamp: assessment.timestamp,
          issues: assessment.detectedIssues.length,
          autoAction: assessment.autoAction,
        });

        logger.debug(`📡 Risk update emitted for ${assessment.sessionId}: ${assessment.riskLevel} (${assessment.riskScore})`);
      }
    } catch (error) {
      logger.warn('⚠️ Failed to emit risk update:', error.message);
    }
  }

  /**
   * Clear cache for a session
   */
  clearCache(sessionId) {
    this.riskCache.delete(sessionId);
    this.riskHistory.delete(sessionId);
    this.autoActionLog.delete(sessionId);
  }

  /**
   * Get cached assessment
   */
  getCachedAssessment(sessionId) {
    return this.riskCache.get(sessionId);
  }
}

// Export singleton instance
module.exports = new RiskAssessmentService();
