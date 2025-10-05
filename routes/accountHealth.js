/**
 * Account Health Routes
 * 
 * API routes for account health monitoring and management
 * 
 * @module routes/accountHealth
 */

const express = require("express");
const router = express.Router();
const accountHealthController = require("../controllers/accountHealthController");
const { verifyToken } = require("../middleware/authMiddleware");

/**
 * @route   GET /api/whatsapp/:sessionId/health
 * @desc    Get current health assessment for an account
 * @access  Private
 * @query   {boolean} useCache - Use cached data if available (default: true)
 * @query   {number} accountAge - Account age in days (default: 30)
 */
router.get("/:sessionId/health", verifyToken, accountHealthController.getAccountHealth);

/**
 * @route   GET /api/whatsapp/:sessionId/health/history
 * @desc    Get health history for an account
 * @access  Private
 * @query   {number} days - Number of days of history to retrieve (default: 7)
 */
router.get("/:sessionId/health/history", verifyToken, accountHealthController.getHealthHistory);

/**
 * @route   POST /api/whatsapp/:sessionId/health/action
 * @desc    Execute health action (rest, reduce, reconnect)
 * @access  Private
 * @body    {string} action - Action to execute (rest|reduce|reconnect)
 * @body    {number} duration - Duration in hours (for 'rest' action)
 * @body    {number} percentage - Reduction percentage (for 'reduce' action)
 * @body    {boolean} force - Force action even if not recommended (default: false)
 */
router.post("/:sessionId/health/action", verifyToken, accountHealthController.executeHealthAction);

/**
 * @route   GET /api/whatsapp/:sessionId/health/components
 * @desc    Get detailed health components breakdown
 * @access  Private
 */
router.get("/:sessionId/health/components", verifyToken, accountHealthController.getHealthComponents);

/**
 * @route   GET /api/whatsapp/:sessionId/health/warnings
 * @desc    Get health warnings for an account
 * @access  Private
 */
router.get("/:sessionId/health/warnings", verifyToken, accountHealthController.getHealthWarnings);

/**
 * @route   GET /api/whatsapp/:sessionId/health/recommendations
 * @desc    Get health recommendations
 * @access  Private
 */
router.get("/:sessionId/health/recommendations", verifyToken, accountHealthController.getHealthRecommendations);

/**
 * @route   POST /api/whatsapp/:sessionId/health/refresh
 * @desc    Refresh health assessment (clear cache and recalculate)
 * @access  Private
 * @body    {number} accountAge - Account age in days (optional)
 */
router.post("/:sessionId/health/refresh", verifyToken, accountHealthController.refreshHealthAssessment);

/**
 * @route   GET /api/whatsapp/:sessionId/health/trends
 * @desc    Get health trends and statistics
 * @access  Private
 * @query   {number} days - Number of days of data to analyze (default: 7)
 */
router.get("/:sessionId/health/trends", verifyToken, accountHealthController.getHealthTrends);

module.exports = router;
