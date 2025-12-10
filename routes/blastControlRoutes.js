const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const blastControlController = require("../controllers/blastControlController");
const { verifyToken } = require("../middleware/authMiddleware");
const { asyncHandler } = require("../middleware/errorHandler");
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.fieldname === "excel") {
      const allowedMimes = [
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 
        "application/vnd.ms-excel", 
        "text/csv" 
      ];
      if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error("Only Excel files (.xlsx, .xls) and CSV files are allowed"), false);
      }
    } else {
      cb(null, true);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, 
  },
});
router.use(verifyToken);
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
  upload.single("excel"), 
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
router.get(
  "/messages/:sessionId",
  asyncHandler(blastControlController.getSessionMessages)
);
router.post(
  "/messages/:sessionId/retry",
  asyncHandler(blastControlController.retryFailedMessages)
);
router.post(
  "/recover",
  asyncHandler(blastControlController.recoverActiveSessions)
);
router.delete(
  "/cleanup/:sessionId",
  asyncHandler(blastControlController.cleanupSession)
);
router.get("/health", asyncHandler(blastControlController.getSystemHealth));
router.get(
  "/stats/:sessionId",
  asyncHandler(blastControlController.getSessionStats)
);
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
