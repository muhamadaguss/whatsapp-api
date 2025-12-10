const logger = require("../utils/logger");
const BlastSession = require("../models/blastSessionModel");
const BlastMessage = require("../models/blastMessageModel");
const { getSocket } = require("../auth/socket");
class RiskAssessmentService {
  constructor() {
    this.riskCache = new Map(); 
    this.riskHistory = new Map(); 
    this.autoActionLog = new Map(); 
  }
  async calculateRiskAssessment(sessionId) {
    try {
      const session = await BlastSession.findOne({ where: { sessionId } });
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }
      const stats = await this.getSessionStatistics(sessionId);
      const failureRisk = this.calculateFailureRisk(stats);
      const velocityRisk = this.calculateVelocityRisk(stats, session);
      const accountRisk = this.calculateAccountRisk(session);
      const patternRisk = this.calculatePatternRisk(stats);
      const timeRisk = this.calculateTimeRisk(session);
      const riskScore = Math.round(
        failureRisk.score * 0.35 +
        velocityRisk.score * 0.25 +
        accountRisk.score * 0.20 +
        patternRisk.score * 0.10 +
        timeRisk.score * 0.10
      );
      const riskLevel = this.getRiskLevel(riskScore);
      const detectedIssues = [
        ...failureRisk.issues,
        ...velocityRisk.issues,
        ...accountRisk.issues,
        ...patternRisk.issues,
        ...timeRisk.issues,
      ];
      const recommendations = this.generateRecommendations(
        riskScore,
        detectedIssues,
        stats,
        session
      );
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
      this.riskCache.set(sessionId, assessment);
      this.addToHistory(sessionId, assessment);
      this.emitRiskUpdate(assessment);
      return assessment;
    } catch (error) {
      logger.error(`Error calculating risk assessment for ${sessionId}:`, error);
      throw error;
    }
  }
  async getSessionStatistics(sessionId) {
    const messages = await BlastMessage.find({ blastSessionId: sessionId });
    const total = messages.length;
    const sent = messages.filter(m => m.status === 'sent').length;
    const failed = messages.filter(m => m.status === 'failed').length;
    const pending = messages.filter(m => m.status === 'pending').length;
    const failureRate = total > 0 ? (failed / total) * 100 : 0;
    const successRate = total > 0 ? (sent / total) * 100 : 0;
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
    const sentMessages = messages.filter(m => m.sentAt);
    let velocity = 0;
    if (sentMessages.length > 1) {
      const firstSent = new Date(sentMessages[0].sentAt);
      const lastSent = new Date(sentMessages[sentMessages.length - 1].sentAt);
      const durationMinutes = (lastSent - firstSent) / (1000 * 60);
      velocity = durationMinutes > 0 ? sentMessages.length / durationMinutes : 0;
    }
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
  calculateFailureRisk(stats) {
    const issues = [];
    let score = 0;
    if (stats.failureRate >= 50) {
      score = 100; 
      issues.push({
        severity: 'critical',
        type: 'failure_rate',
        message: `Extremely high failure rate: ${stats.failureRate.toFixed(1)}%`,
        recommendation: 'Stop campaign immediately and investigate',
      });
    } else if (stats.failureRate >= 30) {
      score = 80; 
      issues.push({
        severity: 'high',
        type: 'failure_rate',
        message: `High failure rate: ${stats.failureRate.toFixed(1)}%`,
        recommendation: 'Pause and review account status',
      });
    } else if (stats.failureRate >= 20) {
      score = 50; 
      issues.push({
        severity: 'medium',
        type: 'failure_rate',
        message: `Moderate failure rate: ${stats.failureRate.toFixed(1)}%`,
        recommendation: 'Monitor closely, consider slowing down',
      });
    } else if (stats.failureRate >= 10) {
      score = 25; 
      issues.push({
        severity: 'low',
        type: 'failure_rate',
        message: `Elevated failure rate: ${stats.failureRate.toFixed(1)}%`,
        recommendation: 'Keep monitoring',
      });
    } else {
      score = 0; 
    }
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
  calculateVelocityRisk(stats, session) {
    const issues = [];
    let score = 0;
    const velocity = stats.velocity;
    const maxSafeVelocity = 3; 
    const accountAge = session.accountAge || 30; 
    let recommendedVelocity = maxSafeVelocity;
    if (accountAge < 7) {
      recommendedVelocity = 1.5; 
    } else if (accountAge < 30) {
      recommendedVelocity = 2.5; 
    }
    if (velocity > recommendedVelocity * 2) {
      score = 100; 
      issues.push({
        severity: 'critical',
        type: 'velocity',
        message: `Sending too fast: ${velocity.toFixed(2)} msg/min (limit: ${recommendedVelocity})`,
        recommendation: 'Reduce sending speed immediately',
      });
    } else if (velocity > recommendedVelocity * 1.5) {
      score = 70; 
      issues.push({
        severity: 'high',
        type: 'velocity',
        message: `Sending speed high: ${velocity.toFixed(2)} msg/min`,
        recommendation: 'Slow down to avoid detection',
      });
    } else if (velocity > recommendedVelocity) {
      score = 40; 
      issues.push({
        severity: 'medium',
        type: 'velocity',
        message: `Sending speed above recommended: ${velocity.toFixed(2)} msg/min`,
        recommendation: 'Consider increasing delays',
      });
    } else {
      score = 0; 
    }
    return { score, issues, value: velocity, recommended: recommendedVelocity };
  }
  calculateAccountRisk(session) {
    const issues = [];
    let score = 0;
    const accountAge = session.accountAge || 0;
    if (accountAge < 3) {
      score = 80; 
      issues.push({
        severity: 'high',
        type: 'account_age',
        message: `Very new account (${accountAge} days old)`,
        recommendation: 'Use ultra-conservative settings',
      });
    } else if (accountAge < 7) {
      score = 50; 
      issues.push({
        severity: 'medium',
        type: 'account_age',
        message: `New account (${accountAge} days old)`,
        recommendation: 'Keep limits low and delays high',
      });
    } else if (accountAge < 30) {
      score = 25; 
      issues.push({
        severity: 'low',
        type: 'account_age',
        message: `Warming account (${accountAge} days old)`,
        recommendation: 'Gradually increase volume',
      });
    }
    return { score, issues, value: accountAge };
  }
  calculatePatternRisk(stats) {
    const issues = [];
    let score = 0;
    if (stats.avgResponseTime > 30000) { 
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
  calculateTimeRisk(session) {
    const issues = [];
    let score = 0;
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay(); 
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
    if (day === 0 || day === 6) { 
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
  getRiskLevel(score) {
    if (score >= 80) return 'critical';
    if (score >= 60) return 'high';
    if (score >= 40) return 'medium';
    if (score >= 20) return 'low';
    return 'safe';
  }
  generateRecommendations(riskScore, issues, stats, session) {
    const recommendations = [];
    const sortedIssues = issues.sort((a, b) => {
      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    });
    sortedIssues.slice(0, 5).forEach(issue => {
      recommendations.push({
        priority: issue.severity,
        title: issue.message,
        action: issue.recommendation,
        type: issue.type,
      });
    });
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
    if (history.length > 100) {
      history.shift();
    }
  }
  getRiskHistory(sessionId, limit = 50) {
    const history = this.riskHistory.get(sessionId) || [];
    return history.slice(-limit);
  }
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
  getAutoActionLog(sessionId) {
    return this.autoActionLog.get(sessionId) || [];
  }
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
  clearCache(sessionId) {
    this.riskCache.delete(sessionId);
    this.riskHistory.delete(sessionId);
    this.autoActionLog.delete(sessionId);
  }
  getCachedAssessment(sessionId) {
    return this.riskCache.get(sessionId);
  }
}
module.exports = new RiskAssessmentService();
