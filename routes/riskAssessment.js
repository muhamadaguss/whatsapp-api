/**
 * Risk Assessment Routes
 * 
 * API endpoints for real-time risk monitoring and auto-actions
 * 
 * @module riskAssessmentRoutes
 */

const express = require("express");
const router = express.Router();
const riskAssessmentController = require("../controllers/riskAssessmentController");
const { verifyToken } = require("../middleware/authMiddleware");

// All routes require authentication
router.use(verifyToken);

/**
 * GET /api/blast/:sessionId/risk-assessment
 * Get current risk assessment for a blast session
 * 
 * Query params:
 * - useCache: boolean (default: true) - Use cached result if available
 * 
 * Response:
 * {
 *   success: true,
 *   data: {
 *     sessionId: string,
 *     timestamp: Date,
 *     riskScore: number (0-100),
 *     riskLevel: 'safe' | 'low' | 'medium' | 'high' | 'critical',
 *     factors: { ... },
 *     detectedIssues: [...],
 *     recommendations: [...],
 *     autoAction: { ... }
 *   },
 *   cached: boolean
 * }
 */
router.get("/:sessionId/risk-assessment", riskAssessmentController.getRiskAssessment);

/**
 * GET /api/blast/:sessionId/risk-factors
 * Get detailed breakdown of risk factors
 */
router.get("/:sessionId/risk-factors", riskAssessmentController.getRiskFactors);

/**
 * GET /api/blast/:sessionId/risk-history
 * Get historical risk data
 * 
 * Query params:
 * - limit: number (default: 50) - Number of history entries to return
 */
router.get("/:sessionId/risk-history", riskAssessmentController.getRiskHistory);

/**
 * GET /api/blast/:sessionId/recommendations
 * Get actionable recommendations
 */
router.get("/:sessionId/recommendations", riskAssessmentController.getRecommendations);

/**
 * POST /api/blast/:sessionId/auto-action
 * Execute automatic action based on risk
 * 
 * Body:
 * {
 *   action: 'pause' | 'stop' | 'slow_down' | 'resume',
 *   reason: string (optional),
 *   force: boolean (optional, default: false)
 * }
 */
router.post("/:sessionId/auto-action", riskAssessmentController.executeAutoAction);

/**
 * POST /api/blast/:sessionId/risk-assessment/refresh
 * Force refresh risk assessment (clear cache)
 */
router.post("/:sessionId/risk-assessment/refresh", riskAssessmentController.refreshRiskAssessment);

module.exports = router;
