/**
 * Account Health Controller
 * 
 * HTTP endpoints for account health monitoring and management
 * 
 * @module accountHealthController
 */

const accountHealthService = require("../services/accountHealthService");
const logger = require("../utils/logger");

/**
 * Get current health assessment for an account
 * GET /api/whatsapp/:sessionId/health
 */
exports.getAccountHealth = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { useCache = 'true', accountAge } = req.query;

    logger.info(`📊 Getting health assessment for ${sessionId}`);

    // Check cache if requested
    if (useCache === 'true') {
      const cached = accountHealthService.getCachedHealth(sessionId);
      if (cached) {
        const cacheAge = Date.now() - new Date(cached.timestamp).getTime();
        if (cacheAge < 60000) { // 1 minute cache
          logger.debug(`Using cached health data for ${sessionId} (${Math.round(cacheAge / 1000)}s old)`);
          return res.json({
            success: true,
            data: cached,
            cached: true,
          });
        }
      }
    }

    // Calculate fresh health assessment
    const age = accountAge ? parseInt(accountAge) : 30; // Default to 30 days
    const assessment = await accountHealthService.calculateAccountHealth(sessionId, age);

    res.json({
      success: true,
      data: assessment,
      cached: false,
    });
  } catch (error) {
    logger.error("❌ Error getting account health:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Get health history for an account
 * GET /api/whatsapp/:sessionId/health/history
 */
exports.getHealthHistory = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { days = '7' } = req.query;

    logger.info(`📈 Getting health history for ${sessionId} (${days} days)`);

    const history = accountHealthService.getHealthHistory(sessionId, parseInt(days));
    const warningLog = accountHealthService.getWarningLog(sessionId);

    res.json({
      success: true,
      data: {
        history,
        warningLog,
        dataPoints: history.length,
        daysRequested: parseInt(days),
      },
    });
  } catch (error) {
    logger.error("❌ Error getting health history:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Execute health action (rest, reduce, reconnect)
 * POST /api/whatsapp/:sessionId/health/action
 */
exports.executeHealthAction = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { action, duration, percentage, force = false } = req.body;

    // Validate action
    const validActions = ['rest', 'reduce', 'reconnect'];
    if (!validActions.includes(action)) {
      return res.status(400).json({
        success: false,
        error: `Invalid action. Must be one of: ${validActions.join(', ')}`,
      });
    }

    logger.info(`🎯 Executing health action for ${sessionId}: ${action}`);

    // Get current health to verify action is appropriate
    if (!force) {
      const health = await accountHealthService.calculateAccountHealth(sessionId);
      
      // Verify action matches recommendation
      if (health.actionRequired.action !== action && action !== 'reconnect') {
        return res.status(400).json({
          success: false,
          error: `Action '${action}' not recommended. Current recommendation: ${health.actionRequired.action}`,
          recommendation: health.actionRequired,
          hint: "Add 'force: true' to override this check",
        });
      }
    }

    // Execute the action
    const result = await accountHealthService.executeHealthAction(sessionId, action, {
      duration,
      percentage,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error("❌ Error executing health action:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Get detailed health components breakdown
 * GET /api/whatsapp/:sessionId/health/components
 */
exports.getHealthComponents = async (req, res) => {
  try {
    const { sessionId } = req.params;

    logger.info(`🔍 Getting health components for ${sessionId}`);

    const assessment = await accountHealthService.calculateAccountHealth(sessionId);

    res.json({
      success: true,
      data: {
        components: assessment.components,
        statistics: assessment.statistics,
        timestamp: assessment.timestamp,
      },
    });
  } catch (error) {
    logger.error("❌ Error getting health components:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Get health warnings for an account
 * GET /api/whatsapp/:sessionId/health/warnings
 */
exports.getHealthWarnings = async (req, res) => {
  try {
    const { sessionId } = req.params;

    logger.info(`⚠️ Getting health warnings for ${sessionId}`);

    // Get current assessment
    const assessment = await accountHealthService.calculateAccountHealth(sessionId);
    
    // Get warning log
    const warningLog = accountHealthService.getWarningLog(sessionId);

    res.json({
      success: true,
      data: {
        currentWarnings: assessment.warnings,
        warningLog,
        totalWarnings: assessment.warnings.length,
        criticalWarnings: assessment.warnings.filter(w => w.severity === 'critical').length,
      },
    });
  } catch (error) {
    logger.error("❌ Error getting health warnings:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Get health recommendations
 * GET /api/whatsapp/:sessionId/health/recommendations
 */
exports.getHealthRecommendations = async (req, res) => {
  try {
    const { sessionId } = req.params;

    logger.info(`💡 Getting health recommendations for ${sessionId}`);

    const assessment = await accountHealthService.calculateAccountHealth(sessionId);

    res.json({
      success: true,
      data: {
        recommendations: assessment.recommendations,
        actionRequired: assessment.actionRequired,
        healthScore: assessment.healthScore,
        healthLevel: assessment.healthLevel,
      },
    });
  } catch (error) {
    logger.error("❌ Error getting health recommendations:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Refresh health assessment (clear cache and recalculate)
 * POST /api/whatsapp/:sessionId/health/refresh
 */
exports.refreshHealthAssessment = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { accountAge } = req.body;

    logger.info(`🔄 Refreshing health assessment for ${sessionId}`);

    // Clear cache
    accountHealthService.clearCache(sessionId);

    // Calculate fresh assessment
    const age = accountAge || 30;
    const assessment = await accountHealthService.calculateAccountHealth(sessionId, age);

    res.json({
      success: true,
      data: assessment,
      message: "Health assessment refreshed successfully",
    });
  } catch (error) {
    logger.error("❌ Error refreshing health assessment:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Get health trends
 * GET /api/whatsapp/:sessionId/health/trends
 */
exports.getHealthTrends = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { days = '7' } = req.query;

    logger.info(`📊 Getting health trends for ${sessionId}`);

    const history = accountHealthService.getHealthHistory(sessionId, parseInt(days));
    
    // Calculate trend statistics
    const scores = history.map(h => h.healthScore);
    const average = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const min = scores.length > 0 ? Math.min(...scores) : 0;
    const max = scores.length > 0 ? Math.max(...scores) : 0;
    
    // Get current assessment for trend direction
    const current = await accountHealthService.calculateAccountHealth(sessionId);
    
    res.json({
      success: true,
      data: {
        trends: current.trends,
        statistics: {
          average: Math.round(average),
          min,
          max,
          current: current.healthScore,
          dataPoints: scores.length,
        },
        history,
      },
    });
  } catch (error) {
    logger.error("❌ Error getting health trends:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
