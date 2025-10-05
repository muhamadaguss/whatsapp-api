/**
 * Analytics Controller
 * 
 * HTTP endpoints for campaign analytics and reporting
 * 
 * @module analyticsController
 */

const AnalyticsService = require("../services/analyticsService");
const logger = require("../utils/logger");

/**
 * Get comprehensive analytics for a campaign (MongoDB)
 * GET /api/blast/analytics/:sessionId
 */
exports.getCampaignAnalytics = async (req, res) => {
  try {
    const { sessionId } = req.params;

    logger.info(`📊 Getting campaign analytics for ${sessionId}`);

    // Use the existing MongoDB analytics if available
    const analytics = await AnalyticsService.getSessionAnalytics(sessionId, req.user.id);

    res.json({
      success: true,
      data: analytics,
    });
  } catch (error) {
    logger.error("❌ Error getting campaign analytics:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Compare multiple campaigns
 * POST /api/blast/analytics/compare
 */
exports.compareCampaigns = async (req, res) => {
  try {
    const { sessionIds } = req.body;

    if (!Array.isArray(sessionIds)) {
      return res.status(400).json({
        success: false,
        error: "sessionIds must be an array",
      });
    }

    logger.info(`🔄 Comparing ${sessionIds.length} campaigns`);

    const comparison = await AnalyticsService.compareCampaignsMongo(sessionIds);

    res.json({
      success: true,
      data: comparison,
    });
  } catch (error) {
    logger.error("❌ Error comparing campaigns:", error);
    res.status(error.message.includes('At least 2') ? 400 : 500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Analyze best time to send
 * GET /api/blast/analytics/best-time/:accountSessionId
 */
exports.analyzeBestTime = async (req, res) => {
  try {
    const { accountSessionId } = req.params;
    const { days = '30' } = req.query;

    logger.info(`⏰ Analyzing best time for ${accountSessionId} (${days} days)`);

    const analysis = await AnalyticsService.analyzeBestTimeMongo(
      accountSessionId,
      parseInt(days)
    );

    res.json({
      success: true,
      data: analysis,
    });
  } catch (error) {
    logger.error("❌ Error analyzing best time:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Export campaign report
 * POST /api/blast/analytics/:sessionId/export
 */
exports.exportCampaignReport = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { format = 'csv' } = req.body;

    logger.info(`📥 Exporting campaign report for ${sessionId} as ${format}`);

    const analytics = await AnalyticsService.getSessionAnalytics(sessionId, req.user.id);

    if (format === 'csv') {
      const csvContent = AnalyticsService.exportAnalyticsToCSV(analytics);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="campaign-${sessionId}-${Date.now()}.csv"`);
      res.send(csvContent);
    } else {
      res.json({
        success: true,
        data: analytics,
      });
    }
  } catch (error) {
    logger.error("❌ Error exporting campaign report:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Get dashboard analytics (all campaigns overview)
 * GET /api/blast/analytics/dashboard
 */
exports.getDashboardAnalytics = async (req, res) => {
  try {
    const { days = '30' } = req.query;

    logger.info(`📈 Getting dashboard analytics for user ${req.user.id}`);

    const analytics = await AnalyticsService.getDashboardAnalytics(
      req.user.id,
      parseInt(days)
    );

    res.json({
      success: true,
      data: analytics,
    });
  } catch (error) {
    logger.error("❌ Error getting dashboard analytics:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
