/**
 * Analytics Routes
 * 
 * API routes for campaign analytics and reporting
 * 
 * @module routes/analytics
 */

const express = require("express");
const router = express.Router();
const analyticsController = require("../controllers/analyticsController");
const { verifyToken } = require("../middleware/authMiddleware");

/**
 * @route   GET /api/blast/analytics/dashboard
 * @desc    Get dashboard analytics (all campaigns overview)
 * @access  Private
 * @query   {number} days - Number of days to analyze (default: 30)
 */
router.get("/analytics/dashboard", verifyToken, analyticsController.getDashboardAnalytics);

/**
 * @route   GET /api/blast/analytics/:sessionId
 * @desc    Get comprehensive analytics for a specific campaign
 * @access  Private
 */
router.get("/analytics/:sessionId", verifyToken, analyticsController.getCampaignAnalytics);

/**
 * @route   POST /api/blast/analytics/compare
 * @desc    Compare multiple campaigns
 * @access  Private
 * @body    {Array<string>} sessionIds - Array of session IDs to compare (2-5 campaigns)
 */
router.post("/analytics/compare", verifyToken, analyticsController.compareCampaigns);

/**
 * @route   GET /api/blast/analytics/best-time/:accountSessionId
 * @desc    Analyze best time to send for an account
 * @access  Private
 * @query   {number} days - Number of days of historical data to analyze (default: 30)
 */
router.get("/analytics/best-time/:accountSessionId", verifyToken, analyticsController.analyzeBestTime);

/**
 * @route   POST /api/blast/analytics/:sessionId/export
 * @desc    Export campaign report
 * @access  Private
 * @body    {string} format - Export format (csv|json, default: csv)
 */
router.post("/analytics/:sessionId/export", verifyToken, analyticsController.exportCampaignReport);

module.exports = router;
