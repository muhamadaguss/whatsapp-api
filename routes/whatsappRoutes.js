const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const { verifyToken } = require("../middleware/authMiddleware");
const { tenantContext } = require("../middleware/tenantContext");
const { withTenantContext } = require("../middleware/tenantIsolation");
const quotaService = require("../services/quotaService");
const {
  getQRImage,
  sendMessageWA,
  uploadExcel,
  logoutSession,
  getActiveSessions,
  getContactDetails,
  getSessionHealth,
} = require("../controllers/whatsappController");

const {
  getAccountMetadata,
  updateAccountCreationDate,
} = require("../controllers/accountMetadataController");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/"); // pastikan folder ini ada
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

// Configure multer for different file types
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    // Allow images for chat messages
    if (file.fieldname === "image") {
      if (file.mimetype.startsWith("image/")) {
        cb(null, true);
      } else {
        cb(new Error("Only image files are allowed for image messages"), false);
      }
    } else if (file.fieldname === "video") {
      // Allow videos for chat messages
      if (file.mimetype.startsWith("video/")) {
        cb(null, true);
      } else {
        cb(new Error("Only video files are allowed for video messages"), false);
      }
    } else {
      // Allow excel files for blast messages
      cb(null, true);
    }
  },
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit for videos
  },
});

router.get("/qr-image/:sessionId", verifyToken, tenantContext, withTenantContext, getQRImage);

// Send message - check quota before allowing
router.post(
  "/send-message",
  verifyToken,
  tenantContext,
  withTenantContext,
  quotaService.requireQuota("messages_sent", 1),
  upload.fields([{ name: "image" }, { name: "video" }]),
  sendMessageWA
);

// Upload Excel for blast - check quota (this will send multiple messages)
router.post(
  "/upload/:sessionId",
  verifyToken,
  tenantContext,
  withTenantContext,
  quotaService.requireQuota("blast_campaigns", 1),
  upload.single("excel"),
  uploadExcel
);

router.post("/logoutSession/:sessionId", verifyToken, tenantContext, withTenantContext, logoutSession);
router.get("/sessions", verifyToken, tenantContext, withTenantContext, getActiveSessions);
router.get("/contact-details/:sessionId/:jid", verifyToken, tenantContext, withTenantContext, getContactDetails);
router.get("/health/:sessionId", verifyToken, tenantContext, withTenantContext, getSessionHealth);

// Account metadata routes (Baileys → Database priority)
router.get("/account/:sessionId/metadata", verifyToken, getAccountMetadata);
router.post("/account/:sessionId/creation-date", verifyToken, updateAccountCreationDate);

module.exports = router;
