const logger = require("../utils/logger");
const BlastSession = require("../models/blastSessionModel");
const BlastMessage = require("../models/blastMessageModel");
const { Op } = require("sequelize");

/**
 * ========== PHASE 2: ANALYTICS & COMPARISON SERVICE ==========
 * Compare Phase 1 vs Phase 2 effectiveness
 * Measure behavioral improvements and pattern detection reduction
 */

class Phase2AnalyticsService {
  constructor() {
    this.metrics = new Map(); // sessionId -> metrics
  }

  /**
   * Calculate statistical variance for timing
   * Higher variance = less predictable = more human-like
   * @param {Array} values - Array of timing values (in ms)
   * @returns {Object} - Variance statistics
   */
  calculateVariance(values) {
    if (values.length === 0) return { mean: 0, variance: 0, stdDev: 0 };

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map(value => Math.pow(value - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
    const stdDev = Math.sqrt(variance);

    return {
      mean: mean.toFixed(2),
      variance: variance.toFixed(2),
      stdDev: stdDev.toFixed(2),
      coefficientOfVariation: mean > 0 ? ((stdDev / mean) * 100).toFixed(2) : 0,
    };
  }

  /**
   * Analyze message timing patterns
   * @param {string} sessionId - Session ID
   * @returns {Object} - Timing analysis
   */
  async analyzeTimingPatterns(sessionId) {
    try {
      const messages = await BlastMessage.findAll({
        where: {
          sessionId,
          status: { [Op.in]: ["sent", "failed"] },
        },
        order: [["updatedAt", "ASC"]],
      });

      if (messages.length < 2) {
        return {
          error: "Not enough messages for analysis",
          messageCount: messages.length,
        };
      }

      // Calculate intervals between messages
      const intervals = [];
      for (let i = 1; i < messages.length; i++) {
        const interval = new Date(messages[i].updatedAt) - new Date(messages[i - 1].updatedAt);
        intervals.push(interval);
      }

      const stats = this.calculateVariance(intervals);

      return {
        sessionId,
        totalMessages: messages.length,
        intervals: {
          count: intervals.length,
          ...stats,
          minInterval: Math.min(...intervals),
          maxInterval: Math.max(...intervals),
        },
        analysis: {
          predictability: stats.coefficientOfVariation < 30 ? "HIGH" : stats.coefficientOfVariation < 50 ? "MEDIUM" : "LOW",
          humanLikeness: stats.coefficientOfVariation > 50 ? "HIGH" : stats.coefficientOfVariation > 30 ? "MEDIUM" : "LOW",
        },
      };
    } catch (error) {
      logger.error(`❌ Failed to analyze timing patterns for ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Detect sequential pattern percentage
   * Lower percentage = better (more randomized)
   * @param {string} sessionId - Session ID
   * @returns {Object} - Sequential pattern analysis
   */
  async analyzeSequentialPattern(sessionId) {
    try {
      const messages = await BlastMessage.findAll({
        where: {
          sessionId,
          status: { [Op.in]: ["sent", "failed"] },
        },
        order: [["updatedAt", "ASC"]],
        attributes: ["messageIndex", "updatedAt"],
      });

      if (messages.length < 2) {
        return {
          error: "Not enough messages for analysis",
          messageCount: messages.length,
        };
      }

      // Count sequential vs non-sequential
      let sequentialCount = 0;
      let nonSequentialCount = 0;

      for (let i = 1; i < messages.length; i++) {
        const prevIndex = messages[i - 1].messageIndex;
        const currIndex = messages[i].messageIndex;

        if (currIndex === prevIndex + 1) {
          sequentialCount++;
        } else {
          nonSequentialCount++;
        }
      }

      const totalTransitions = messages.length - 1;
      const sequentialPercentage = (sequentialCount / totalTransitions) * 100;
      const nonSequentialPercentage = (nonSequentialCount / totalTransitions) * 100;

      return {
        sessionId,
        totalMessages: messages.length,
        transitions: totalTransitions,
        sequential: sequentialCount,
        nonSequential: nonSequentialCount,
        sequentialPercentage: sequentialPercentage.toFixed(2) + "%",
        nonSequentialPercentage: nonSequentialPercentage.toFixed(2) + "%",
        phase2Target: "15-20% non-sequential",
        meetsTarget: nonSequentialPercentage >= 15 && nonSequentialPercentage <= 25,
        rating:
          nonSequentialPercentage >= 15
            ? "EXCELLENT"
            : nonSequentialPercentage >= 10
            ? "GOOD"
            : nonSequentialPercentage >= 5
            ? "FAIR"
            : "NEEDS IMPROVEMENT",
      };
    } catch (error) {
      logger.error(`❌ Failed to analyze sequential pattern for ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Compare Phase 1 vs Phase 2 sessions
   * @param {string} phase1SessionId - Phase 1 session ID
   * @param {string} phase2SessionId - Phase 2 session ID
   * @returns {Object} - Comparison results
   */
  async comparePhases(phase1SessionId, phase2SessionId) {
    try {
      const phase1Timing = await this.analyzeTimingPatterns(phase1SessionId);
      const phase2Timing = await this.analyzeTimingPatterns(phase2SessionId);

      const phase1Sequential = await this.analyzeSequentialPattern(phase1SessionId);
      const phase2Sequential = await this.analyzeSequentialPattern(phase2SessionId);

      const phase1Session = await BlastSession.findOne({ where: { sessionId: phase1SessionId } });
      const phase2Session = await BlastSession.findOne({ where: { sessionId: phase2SessionId } });

      const phase1Messages = await BlastMessage.findAll({
        where: { sessionId: phase1SessionId },
      });

      const phase2Messages = await BlastMessage.findAll({
        where: { sessionId: phase2SessionId },
      });

      const phase1Stats = {
        total: phase1Messages.length,
        sent: phase1Messages.filter(m => m.status === "sent").length,
        failed: phase1Messages.filter(m => m.status === "failed").length,
      };

      const phase2Stats = {
        total: phase2Messages.length,
        sent: phase2Messages.filter(m => m.status === "sent").length,
        failed: phase2Messages.filter(m => m.status === "failed").length,
      };

      const phase1BanRate = phase1Stats.total > 0 ? (phase1Stats.failed / phase1Stats.total) * 100 : 0;
      const phase2BanRate = phase2Stats.total > 0 ? (phase2Stats.failed / phase2Stats.total) * 100 : 0;

      return {
        comparison: {
          phase1: {
            sessionId: phase1SessionId,
            stats: phase1Stats,
            banRate: phase1BanRate.toFixed(2) + "%",
            timing: phase1Timing,
            sequential: phase1Sequential,
          },
          phase2: {
            sessionId: phase2SessionId,
            stats: phase2Stats,
            banRate: phase2BanRate.toFixed(2) + "%",
            timing: phase2Timing,
            sequential: phase2Sequential,
          },
        },
        improvements: {
          banRateReduction: (phase1BanRate - phase2BanRate).toFixed(2) + "%",
          varianceIncrease:
            phase1Timing.intervals && phase2Timing.intervals
              ? ((parseFloat(phase2Timing.intervals.coefficientOfVariation) / parseFloat(phase1Timing.intervals.coefficientOfVariation) - 1) * 100).toFixed(2) + "%"
              : "N/A",
          nonSequentialImprovement:
            phase1Sequential.nonSequentialPercentage && phase2Sequential.nonSequentialPercentage
              ? (parseFloat(phase2Sequential.nonSequentialPercentage) - parseFloat(phase1Sequential.nonSequentialPercentage)).toFixed(2) + "%"
              : "N/A",
        },
        verdict: {
          phase2Better: phase2BanRate < phase1BanRate,
          meetsPhase2Goals: phase2BanRate <= 10 && parseFloat(phase2Sequential.nonSequentialPercentage) >= 15,
        },
      };
    } catch (error) {
      logger.error("❌ Failed to compare phases:", error);
      throw error;
    }
  }

  /**
   * Generate Phase 2 effectiveness report
   * @param {string} sessionId - Session ID
   * @returns {Object} - Effectiveness report
   */
  async generateEffectivenessReport(sessionId) {
    try {
      const session = await BlastSession.findOne({ where: { sessionId } });
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      const timing = await this.analyzeTimingPatterns(sessionId);
      const sequential = await this.analyzeSequentialPattern(sessionId);

      const messages = await BlastMessage.findAll({ where: { sessionId } });
      const stats = {
        total: messages.length,
        sent: messages.filter(m => m.status === "sent").length,
        failed: messages.filter(m => m.status === "failed").length,
      };

      const banRate = stats.total > 0 ? (stats.failed / stats.total) * 100 : 0;

      // Calculate Phase 2 feature scores
      const scores = {
        timingVariance: timing.intervals && parseFloat(timing.intervals.coefficientOfVariation) > 50 ? 100 : parseFloat(timing.intervals.coefficientOfVariation) * 2,
        nonSequentialOrder: sequential.nonSequentialPercentage ? parseFloat(sequential.nonSequentialPercentage) * 5 : 0,
        banRate: Math.max(0, 100 - banRate * 10),
      };

      const overallScore = (scores.timingVariance + scores.nonSequentialOrder + scores.banRate) / 3;

      return {
        sessionId,
        session: {
          campaignName: session.campaignName,
          status: session.status,
          accountAge: session.config?.accountAge || "UNKNOWN",
        },
        stats,
        banRate: banRate.toFixed(2) + "%",
        timing,
        sequential,
        phase2Scores: {
          timingVariance: scores.timingVariance.toFixed(2),
          nonSequentialOrder: scores.nonSequentialOrder.toFixed(2),
          banRate: scores.banRate.toFixed(2),
          overall: overallScore.toFixed(2),
        },
        rating:
          overallScore >= 80
            ? "EXCELLENT"
            : overallScore >= 60
            ? "GOOD"
            : overallScore >= 40
            ? "FAIR"
            : "NEEDS IMPROVEMENT",
        recommendations: this.generateRecommendations(banRate, timing, sequential),
      };
    } catch (error) {
      logger.error(`❌ Failed to generate effectiveness report for ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Generate recommendations based on analysis
   * @param {number} banRate - Ban rate percentage
   * @param {Object} timing - Timing analysis
   * @param {Object} sequential - Sequential analysis
   * @returns {Array} - Array of recommendations
   */
  generateRecommendations(banRate, timing, sequential) {
    const recommendations = [];

    if (banRate > 10) {
      recommendations.push({
        priority: "HIGH",
        issue: "Ban rate above Phase 2 target (10%)",
        suggestion: "Consider increasing rest periods and adding more chaos delays",
      });
    }

    if (timing.intervals && parseFloat(timing.intervals.coefficientOfVariation) < 50) {
      recommendations.push({
        priority: "MEDIUM",
        issue: "Timing variance too low (predictable pattern)",
        suggestion: "Increase random pause variations and longer break frequencies",
      });
    }

    if (sequential.nonSequentialPercentage && parseFloat(sequential.nonSequentialPercentage) < 15) {
      recommendations.push({
        priority: "MEDIUM",
        issue: "Sequential order too high (not enough randomization)",
        suggestion: "Enable or increase message shuffling percentage in queue handler",
      });
    }

    if (recommendations.length === 0) {
      recommendations.push({
        priority: "LOW",
        issue: "All metrics within Phase 2 targets",
        suggestion: "Continue monitoring and consider Phase 3 optimizations",
      });
    }

    return recommendations;
  }
}

// Export singleton instance
module.exports = new Phase2AnalyticsService();
