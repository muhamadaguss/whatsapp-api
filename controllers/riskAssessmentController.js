/**
 * Risk Assessment Controller
 * 
 * Handles API endpoints for real-time risk assessment
 * 
 * Endpoints:
 * - GET /api/blast/:sessionId/risk-assessment
 * - POST /api/blast/:sessionId/auto-action
 * - GET /api/blast/:sessionId/risk-history
 * 
 * @module riskAssessmentController
 */

const riskAssessmentService = require("../services/riskAssessmentService");
const BlastSession = require("../models/blastSessionModel");
const logger = require("../utils/logger");

/**
 * GET /api/blast/:sessionId/risk-assessment
 * Get current risk assessment for a blast session
 */
exports.getRiskAssessment = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { useCache = 'true' } = req.query;

    // Check if session exists
    const session = await BlastSession.findById(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: "Session not found",
      });
    }

    // Try to use cached assessment if requested and recent (< 10 seconds old)
    if (useCache === 'true') {
      const cached = riskAssessmentService.getCachedAssessment(sessionId);
      if (cached) {
        const age = Date.now() - new Date(cached.timestamp).getTime();
        if (age < 10000) { // Less than 10 seconds old
          return res.json({
            success: true,
            data: cached,
            cached: true,
            cacheAge: age,
          });
        }
      }
    }

    // Calculate fresh assessment
    const assessment = await riskAssessmentService.calculateRiskAssessment(sessionId);

    res.json({
      success: true,
      data: assessment,
      cached: false,
    });

  } catch (error) {
    logger.error("Error getting risk assessment:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * POST /api/blast/:sessionId/auto-action
 * Execute automatic action based on risk assessment
 */
exports.executeAutoAction = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { action, reason, force = false } = req.body;

    // Validate action
    const validActions = ['pause', 'stop', 'slow_down', 'resume'];
    if (!validActions.includes(action)) {
      return res.status(400).json({
        success: false,
        error: `Invalid action. Must be one of: ${validActions.join(', ')}`,
      });
    }

    // Check if session exists
    const session = await BlastSession.findById(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: "Session not found",
      });
    }

    // Get current risk assessment
    const assessment = await riskAssessmentService.calculateRiskAssessment(sessionId);

    // Check if action is recommended (unless forced)
    if (!force && assessment.autoAction.action !== action && action !== 'resume') {
      return res.status(400).json({
        success: false,
        error: `Action '${action}' is not recommended. Current recommendation: ${assessment.autoAction.action}`,
        recommendation: assessment.autoAction,
      });
    }

    // Execute the action
    let result;
    switch (action) {
      case 'pause':
        session.status = 'paused';
        session.pausedAt = new Date();
        session.pausedReason = reason || 'Auto-paused due to risk detection';
        await session.save();
        result = { message: 'Session paused successfully' };
        break;

      case 'stop':
        session.status = 'stopped';
        session.stoppedAt = new Date();
        session.stoppedReason = reason || 'Auto-stopped due to critical risk';
        await session.save();
        result = { message: 'Session stopped successfully' };
        break;

      case 'slow_down':
        // Increase delays by 50%
        const currentConfig = session.config || {};
        const newConfig = {
          ...currentConfig,
          messageDelayMin: Math.round((currentConfig.messageDelayMin || 15) * 1.5),
          messageDelayMax: Math.round((currentConfig.messageDelayMax || 30) * 1.5),
        };
        session.config = newConfig;
        await session.save();
        result = { 
          message: 'Sending speed reduced',
          newConfig: {
            messageDelayMin: newConfig.messageDelayMin,
            messageDelayMax: newConfig.messageDelayMax,
          },
        };
        break;

      case 'resume':
        if (session.status !== 'paused') {
          return res.status(400).json({
            success: false,
            error: 'Session is not paused',
          });
        }
        session.status = 'active';
        session.resumedAt = new Date();
        await session.save();
        result = { message: 'Session resumed successfully' };
        break;
    }

    // Log the auto-action
    riskAssessmentService.logAutoAction(sessionId, action, reason || 'Manual trigger');

    res.json({
      success: true,
      action,
      result,
      newStatus: session.status,
      riskLevel: assessment.riskLevel,
      riskScore: assessment.riskScore,
    });

  } catch (error) {
    logger.error("Error executing auto-action:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * GET /api/blast/:sessionId/risk-history
 * Get historical risk data for a session
 */
exports.getRiskHistory = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { limit = 50 } = req.query;

    // Check if session exists
    const session = await BlastSession.findById(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: "Session not found",
      });
    }

    // Get risk history
    const history = riskAssessmentService.getRiskHistory(sessionId, parseInt(limit));

    // Get auto-action log
    const autoActions = riskAssessmentService.getAutoActionLog(sessionId);

    res.json({
      success: true,
      data: {
        sessionId,
        history,
        autoActions,
        totalEntries: history.length,
      },
    });

  } catch (error) {
    logger.error("Error getting risk history:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * GET /api/blast/:sessionId/risk-factors
 * Get detailed breakdown of current risk factors
 */
exports.getRiskFactors = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const assessment = await riskAssessmentService.calculateRiskAssessment(sessionId);

    res.json({
      success: true,
      data: {
        sessionId,
        timestamp: assessment.timestamp,
        overallRisk: {
          score: assessment.riskScore,
          level: assessment.riskLevel,
        },
        factors: assessment.factors,
        statistics: assessment.statistics,
      },
    });

  } catch (error) {
    logger.error("Error getting risk factors:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * POST /api/blast/:sessionId/risk-assessment/refresh
 * Force refresh risk assessment (clear cache and recalculate)
 */
exports.refreshRiskAssessment = async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Clear cache
    riskAssessmentService.clearCache(sessionId);

    // Recalculate
    const assessment = await riskAssessmentService.calculateRiskAssessment(sessionId);

    res.json({
      success: true,
      data: assessment,
      message: 'Risk assessment refreshed',
    });

  } catch (error) {
    logger.error("Error refreshing risk assessment:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * GET /api/blast/sessions/:sessionId/recommendations
 * Get actionable recommendations based on current risk
 */
exports.getRecommendations = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const assessment = await riskAssessmentService.calculateRiskAssessment(sessionId);

    res.json({
      success: true,
      data: {
        sessionId,
        riskLevel: assessment.riskLevel,
        riskScore: assessment.riskScore,
        recommendations: assessment.recommendations,
        autoAction: assessment.autoAction,
        issueCount: assessment.detectedIssues.length,
      },
    });

  } catch (error) {
    logger.error("Error getting recommendations:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
