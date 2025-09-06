const express = require("express");
const router = express.Router();
const blastControlController = require("../controllers/blastControlController");
const { verifyToken } = require("../middleware/authMiddleware");
const { asyncHandler } = require("../middleware/errorHandler");

/**
 * Blast Control Routes
 * Handles pause/resume/stop functionality for blast sessions
 */

// Apply auth middleware to all routes
router.use(verifyToken);

// Session Management Routes
router.post(
  "/sessions/:sessionId/action",
  asyncHandler(blastControlController.handleSessionAction)
);
router.post(
  "/sessions/:sessionId/validate-phones",
  asyncHandler(blastControlController.validateSessionPhones)
);
router.post(
  "/sessions",
  asyncHandler(blastControlController.createBlastSession)
);
router.post(
  "/start/:sessionId",
  asyncHandler(blastControlController.startBlastSession)
);
router.post(
  "/force-start/:sessionId",
  asyncHandler(blastControlController.forceStartBlastSession)
);
router.post(
  "/pause/:sessionId",
  asyncHandler(blastControlController.pauseBlastSession)
);
router.post(
  "/resume/:sessionId",
  asyncHandler(blastControlController.resumeBlastSession)
);
router.post(
  "/stop/:sessionId",
  asyncHandler(blastControlController.stopBlastSession)
);

// Status and Progress Routes
router.get(
  "/status/:sessionId",
  asyncHandler(blastControlController.getBlastStatus)
);
router.get(
  "/progress/:sessionId",
  asyncHandler(blastControlController.getBlastProgress)
);
router.get(
  "/sessions",
  asyncHandler(blastControlController.getUserBlastSessions)
);

// Message Queue Routes
router.get(
  "/messages/:sessionId",
  asyncHandler(blastControlController.getSessionMessages)
);
router.post(
  "/messages/:sessionId/retry",
  asyncHandler(blastControlController.retryFailedMessages)
);

// Recovery and Cleanup Routes
router.post(
  "/recover",
  asyncHandler(blastControlController.recoverActiveSessions)
);
router.delete(
  "/cleanup/:sessionId",
  asyncHandler(blastControlController.cleanupSession)
);

// Health and Statistics Routes
router.get("/health", asyncHandler(blastControlController.getSystemHealth));
router.get(
  "/stats/:sessionId",
  asyncHandler(blastControlController.getSessionStats)
);

// =============================================================================
// PHASE 3 - ADVANCED FEATURES ROUTES
// =============================================================================

// Analytics Routes
router.get(
  "/analytics/:sessionId", 
  asyncHandler(blastControlController.getSessionAnalytics)
);
router.get(
  "/analytics/dashboard/overview", 
  asyncHandler(blastControlController.getDashboardAnalytics)
);
router.get(
  "/analytics/:sessionId/export", 
  asyncHandler(blastControlController.exportAnalytics)
);

// Phone Validation Routes
router.post(
  "/validation/phone/batch", 
  asyncHandler(blastControlController.validatePhoneNumbers)
);
router.post(
  "/validation/phone/single", 
  asyncHandler(blastControlController.validateSinglePhone)
);
router.post(
  "/validation/phone/export", 
  asyncHandler(blastControlController.exportPhoneValidation)
);

// Auto Retry Configuration Routes
router.post(
  "/retry/:sessionId/configure", 
  asyncHandler(blastControlController.configureAutoRetry)
);
router.post(
  "/retry/:sessionId/disable", 
  asyncHandler(blastControlController.disableAutoRetry)
);
router.get(
  "/retry/:sessionId/status", 
  asyncHandler(blastControlController.getAutoRetryStatus)
);
router.post(
  "/retry/:sessionId/pause", 
  asyncHandler(blastControlController.pauseAutoRetry)
);
router.post(
  "/retry/:sessionId/resume", 
  asyncHandler(blastControlController.resumeAutoRetry)
);
router.post(
  "/retry/messages/force", 
  asyncHandler(blastControlController.forceRetryMessages)
);
router.get(
  "/retry/service/status", 
  asyncHandler(blastControlController.getAutoRetryServiceStatus)
);

// Bulk Operations Routes
router.post(
  "/bulk/retry", 
  asyncHandler(blastControlController.bulkRetryFailedMessages)
);
router.post(
  "/bulk/messages/status", 
  asyncHandler(blastControlController.bulkUpdateMessageStatus)
);
router.post(
  "/bulk/messages/delete", 
  asyncHandler(blastControlController.bulkDeleteMessages)
);
router.post(
  "/bulk/validation/phone", 
  asyncHandler(blastControlController.bulkValidatePhoneNumbers)
);
router.post(
  "/bulk/campaigns/control", 
  asyncHandler(blastControlController.bulkCampaignControl)
);
router.post(
  "/bulk/campaigns/export", 
  asyncHandler(blastControlController.bulkExportCampaignData)
);
router.post(
  "/bulk/campaigns/cleanup", 
  asyncHandler(blastControlController.bulkCleanupCampaigns)
);

module.exports = router;
