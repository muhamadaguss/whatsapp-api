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

module.exports = router;
