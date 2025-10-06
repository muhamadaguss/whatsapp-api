/**
 * Adaptive Delay Service - PHASE 3 TASK [P3-1]
 * 
 * ML-Based Adaptive Delay System that automatically adjusts delays
 * based on real-time risk assessment and historical success patterns.
 * 
 * Features:
 * - Real-time risk monitoring integration
 * - Automatic delay adjustment (HIGH=2x, MEDIUM=1.5x, LOW=normal)
 * - Learning from historical success/failure patterns
 * - Dynamic throttling based on failure rate
 * - Predictive delay optimization
 * 
 * @module adaptiveDelayService
 */

const logger = require("../utils/logger");
const RiskAssessmentService = require("./riskAssessmentService");
const BlastSession = require("../models/blastSessionModel");
const BlastMessage = require("../models/blastMessageModel");

class AdaptiveDelayService {
  constructor() {
    this.riskService = new RiskAssessmentService();
    
    // Historical learning data
    this.successPatterns = new Map(); // Store successful delay patterns
    this.failurePatterns = new Map(); // Store failed delay patterns
    
    // Adaptive multipliers
    this.delayMultipliers = {
      CRITICAL: 3.0,  // 3x slower for critical risk
      HIGH: 2.0,      // 2x slower for high risk
      MEDIUM: 1.5,    // 1.5x slower for medium risk
      LOW: 1.0,       // Normal speed for low risk
      VERY_LOW: 0.85  // Slightly faster for very low risk (bonus)
    };
    
    // Learning rate for ML adjustment
    this.learningRate = 0.1;
    
    // Performance tracking
    this.adjustmentHistory = [];
    this.maxHistorySize = 1000;
  }

  /**
   * Get adaptive delay based on current risk assessment
   * @param {string} sessionId - Blast session ID
   * @param {Object} baseDelay - Base delay configuration {min, max}
   * @returns {Promise<Object>} Adjusted delay configuration
   */
  async getAdaptiveDelay(sessionId, baseDelay) {
    try {
      // Get real-time risk assessment
      const riskAssessment = await this.riskService.calculateRiskAssessment(sessionId);
      
      // Determine risk level
      const riskLevel = this.determineRiskLevel(riskAssessment.overall_risk_score);
      
      // Get multiplier (with learning adjustment)
      const multiplier = await this.getLearnedMultiplier(sessionId, riskLevel);
      
      // Calculate adjusted delays
      const adjustedDelay = {
        min: Math.round(baseDelay.min * multiplier),
        max: Math.round(baseDelay.max * multiplier),
        original_min: baseDelay.min,
        original_max: baseDelay.max,
        multiplier: multiplier,
        riskLevel: riskLevel,
        riskScore: riskAssessment.overall_risk_score,
        reason: this.getAdjustmentReason(riskLevel, riskAssessment)
      };
      
      // Log adjustment
      this.logAdjustment(sessionId, adjustedDelay, riskAssessment);
      
      logger.info(`[AdaptiveDelay] Session ${sessionId}: ${baseDelay.min}-${baseDelay.max}s → ${adjustedDelay.min}-${adjustedDelay.max}s (${riskLevel}, ${multiplier}x)`);
      
      return adjustedDelay;
      
    } catch (error) {
      logger.error(`[AdaptiveDelay] Error calculating adaptive delay:`, error);
      // Fallback to base delay on error
      return {
        ...baseDelay,
        multiplier: 1.0,
        riskLevel: 'UNKNOWN',
        error: error.message
      };
    }
  }

  /**
   * Determine risk level from risk score
   * @param {number} riskScore - Risk score (0-100)
   * @returns {string} Risk level
   */
  determineRiskLevel(riskScore) {
    if (riskScore >= 80) return 'CRITICAL';
    if (riskScore >= 60) return 'HIGH';
    if (riskScore >= 40) return 'MEDIUM';
    if (riskScore >= 20) return 'LOW';
    return 'VERY_LOW';
  }

  /**
   * Get learned multiplier based on historical patterns
   * @param {string} sessionId - Blast session ID
   * @param {string} riskLevel - Current risk level
   * @returns {Promise<number>} Adjusted multiplier
   */
  async getLearnedMultiplier(sessionId, riskLevel) {
    // Start with base multiplier
    let multiplier = this.delayMultipliers[riskLevel] || 1.0;
    
    // Get session context for learning
    const session = await BlastSession.findOne({ where: { sessionId } });
    if (!session) return multiplier;
    
    const accountAge = session.accountAge || 'NEW';
    const patternKey = `${accountAge}_${riskLevel}`;
    
    // Check if we have learned adjustments for this pattern
    const successPattern = this.successPatterns.get(patternKey);
    const failurePattern = this.failurePatterns.get(patternKey);
    
    if (successPattern && failurePattern) {
      // Calculate success rate
      const totalAttempts = successPattern.count + failurePattern.count;
      const successRate = successPattern.count / totalAttempts;
      
      // Adjust multiplier based on success rate
      if (successRate < 0.85) {
        // Low success rate - increase delay more
        multiplier *= (1 + this.learningRate);
      } else if (successRate > 0.95) {
        // High success rate - can reduce delay slightly
        multiplier *= (1 - this.learningRate * 0.5);
      }
      
      // Ensure multiplier stays within reasonable bounds
      multiplier = Math.max(0.5, Math.min(5.0, multiplier));
    }
    
    return multiplier;
  }

  /**
   * Learn from session outcome (success or failure)
   * @param {string} sessionId - Blast session ID
   * @param {boolean} success - Whether session was successful
   * @param {Object} delayUsed - Delay configuration that was used
   */
  async learnFromOutcome(sessionId, success, delayUsed) {
    try {
      const session = await BlastSession.findOne({ where: { sessionId } });
      if (!session) return;
      
      const accountAge = session.accountAge || 'NEW';
      const riskLevel = delayUsed.riskLevel || 'MEDIUM';
      const patternKey = `${accountAge}_${riskLevel}`;
      
      // Update pattern maps
      if (success) {
        const current = this.successPatterns.get(patternKey) || { count: 0, avgMultiplier: 0 };
        current.count += 1;
        current.avgMultiplier = ((current.avgMultiplier * (current.count - 1)) + delayUsed.multiplier) / current.count;
        this.successPatterns.set(patternKey, current);
        
        logger.info(`[AdaptiveDelay] Learned SUCCESS: ${patternKey}, multiplier ${delayUsed.multiplier}, total successes: ${current.count}`);
      } else {
        const current = this.failurePatterns.get(patternKey) || { count: 0, avgMultiplier: 0 };
        current.count += 1;
        current.avgMultiplier = ((current.avgMultiplier * (current.count - 1)) + delayUsed.multiplier) / current.count;
        this.failurePatterns.set(patternKey, current);
        
        logger.warn(`[AdaptiveDelay] Learned FAILURE: ${patternKey}, multiplier ${delayUsed.multiplier}, total failures: ${current.count}`);
      }
      
    } catch (error) {
      logger.error(`[AdaptiveDelay] Error learning from outcome:`, error);
    }
  }

  /**
   * Get adjustment reason for logging
   * @param {string} riskLevel - Risk level
   * @param {Object} riskAssessment - Full risk assessment
   * @returns {string} Human-readable reason
   */
  getAdjustmentReason(riskLevel, riskAssessment) {
    const reasons = [];
    
    if (riskLevel === 'CRITICAL' || riskLevel === 'HIGH') {
      if (riskAssessment.failure_rate_score > 60) {
        reasons.push('High failure rate detected');
      }
      if (riskAssessment.velocity_risk_score > 60) {
        reasons.push('Excessive velocity');
      }
      if (riskAssessment.account_risk_score > 60) {
        reasons.push('Account health concerns');
      }
    }
    
    if (reasons.length === 0) {
      return `Standard ${riskLevel} risk adjustment`;
    }
    
    return reasons.join(', ');
  }

  /**
   * Log adjustment for tracking
   * @param {string} sessionId - Session ID
   * @param {Object} adjustedDelay - Adjusted delay object
   * @param {Object} riskAssessment - Risk assessment
   */
  logAdjustment(sessionId, adjustedDelay, riskAssessment) {
    const logEntry = {
      timestamp: new Date(),
      sessionId,
      ...adjustedDelay,
      riskDetails: {
        overall: riskAssessment.overall_risk_score,
        failure: riskAssessment.failure_rate_score,
        velocity: riskAssessment.velocity_risk_score,
        account: riskAssessment.account_risk_score
      }
    };
    
    this.adjustmentHistory.push(logEntry);
    
    // Keep history size manageable
    if (this.adjustmentHistory.length > this.maxHistorySize) {
      this.adjustmentHistory.shift();
    }
  }

  /**
   * Get dynamic throttle level based on failure rate
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object>} Throttle configuration
   */
  async getDynamicThrottle(sessionId) {
    try {
      const stats = await this.getSessionStats(sessionId);
      const failureRate = stats.failed / (stats.sent + stats.failed) || 0;
      
      let throttleLevel = 'NONE';
      let throttleMultiplier = 1.0;
      let shouldPause = false;
      let pauseDuration = 0;
      
      if (failureRate > 0.10) { // 10% failure rate
        throttleLevel = 'CRITICAL';
        throttleMultiplier = 3.0;
        shouldPause = true;
        pauseDuration = 300000; // 5 minutes
      } else if (failureRate > 0.05) { // 5% failure rate
        throttleLevel = 'HIGH';
        throttleMultiplier = 2.0;
        shouldPause = true;
        pauseDuration = 120000; // 2 minutes
      } else if (failureRate > 0.03) { // 3% failure rate
        throttleLevel = 'MEDIUM';
        throttleMultiplier = 1.5;
      }
      
      return {
        throttleLevel,
        throttleMultiplier,
        shouldPause,
        pauseDuration,
        failureRate: Math.round(failureRate * 100),
        reason: `Failure rate: ${Math.round(failureRate * 100)}%`
      };
      
    } catch (error) {
      logger.error(`[AdaptiveDelay] Error calculating dynamic throttle:`, error);
      return {
        throttleLevel: 'NONE',
        throttleMultiplier: 1.0,
        shouldPause: false,
        error: error.message
      };
    }
  }

  /**
   * Get session statistics
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object>} Session stats
   */
  async getSessionStats(sessionId) {
    const session = await BlastSession.findOne({ where: { sessionId } });
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    
    const messages = await BlastMessage.findAll({ where: { blast_session_id: sessionId } });
    
    return {
      total: messages.length,
      sent: messages.filter(m => m.status === 'sent').length,
      failed: messages.filter(m => m.status === 'failed').length,
      pending: messages.filter(m => m.status === 'pending').length
    };
  }

  /**
   * Get adaptive delay recommendations for new session
   * @param {string} accountAge - Account age (NEW/WARMING/ESTABLISHED)
   * @returns {Object} Recommended delay configuration
   */
  getRecommendedDelays(accountAge) {
    const baseRecommendations = {
      NEW: { min: 90, max: 300, recommended: 'Very conservative for new accounts' },
      WARMING: { min: 60, max: 180, recommended: 'Moderate delays for warming accounts' },
      ESTABLISHED: { min: 45, max: 150, recommended: 'Standard delays for established accounts' }
    };
    
    const base = baseRecommendations[accountAge] || baseRecommendations.NEW;
    
    // Check learned patterns for this account age
    const learnedPatterns = [];
    for (const [key, pattern] of this.successPatterns.entries()) {
      if (key.startsWith(accountAge)) {
        learnedPatterns.push(pattern);
      }
    }
    
    if (learnedPatterns.length > 0) {
      // Calculate average successful multiplier
      const avgMultiplier = learnedPatterns.reduce((sum, p) => sum + p.avgMultiplier, 0) / learnedPatterns.length;
      
      return {
        ...base,
        min: Math.round(base.min * avgMultiplier),
        max: Math.round(base.max * avgMultiplier),
        learnedMultiplier: avgMultiplier,
        basedOnSuccesses: learnedPatterns.reduce((sum, p) => sum + p.count, 0),
        note: `Adjusted based on ${learnedPatterns.length} learned patterns`
      };
    }
    
    return base;
  }

  /**
   * Get performance report
   * @returns {Object} Performance statistics
   */
  getPerformanceReport() {
    const recentAdjustments = this.adjustmentHistory.slice(-100);
    
    if (recentAdjustments.length === 0) {
      return {
        totalAdjustments: 0,
        message: 'No adjustments made yet'
      };
    }
    
    const riskLevelCounts = {};
    const avgMultipliers = {};
    
    recentAdjustments.forEach(adj => {
      riskLevelCounts[adj.riskLevel] = (riskLevelCounts[adj.riskLevel] || 0) + 1;
      if (!avgMultipliers[adj.riskLevel]) {
        avgMultipliers[adj.riskLevel] = [];
      }
      avgMultipliers[adj.riskLevel].push(adj.multiplier);
    });
    
    // Calculate averages
    const avgMultipliersByLevel = {};
    for (const [level, multipliers] of Object.entries(avgMultipliers)) {
      avgMultipliersByLevel[level] = (multipliers.reduce((a, b) => a + b, 0) / multipliers.length).toFixed(2);
    }
    
    return {
      totalAdjustments: this.adjustmentHistory.length,
      recentAdjustments: recentAdjustments.length,
      riskLevelDistribution: riskLevelCounts,
      avgMultipliersByRiskLevel: avgMultipliersByLevel,
      learnedPatterns: {
        successPatterns: this.successPatterns.size,
        failurePatterns: this.failurePatterns.size
      }
    };
  }

  /**
   * Reset learning data (for testing or new deployment)
   */
  resetLearning() {
    this.successPatterns.clear();
    this.failurePatterns.clear();
    this.adjustmentHistory = [];
    logger.warn('[AdaptiveDelay] Learning data reset');
  }

  /**
   * Export learning data for persistence
   * @returns {Object} Serializable learning data
   */
  exportLearningData() {
    return {
      successPatterns: Array.from(this.successPatterns.entries()),
      failurePatterns: Array.from(this.failurePatterns.entries()),
      adjustmentHistory: this.adjustmentHistory.slice(-100), // Last 100 only
      exportedAt: new Date()
    };
  }

  /**
   * Import learning data from persistence
   * @param {Object} data - Exported learning data
   */
  importLearningData(data) {
    if (!data) return;
    
    try {
      if (data.successPatterns) {
        this.successPatterns = new Map(data.successPatterns);
      }
      if (data.failurePatterns) {
        this.failurePatterns = new Map(data.failurePatterns);
      }
      if (data.adjustmentHistory) {
        this.adjustmentHistory = data.adjustmentHistory;
      }
      
      logger.info('[AdaptiveDelay] Learning data imported successfully');
    } catch (error) {
      logger.error('[AdaptiveDelay] Error importing learning data:', error);
    }
  }
}

// Singleton instance
let instance = null;

/**
 * Get singleton instance of AdaptiveDelayService
 * @returns {AdaptiveDelayService}
 */
function getAdaptiveDelayService() {
  if (!instance) {
    instance = new AdaptiveDelayService();
  }
  return instance;
}

module.exports = {
  AdaptiveDelayService,
  getAdaptiveDelayService
};
