const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const { verifyToken } = require("../middleware/authMiddleware");
const {
  getQRImage,
  sendMessageWA,
  uploadExcel,
  logoutSession,
  getActiveSessions,
  getContactDetails,
  getSessionHealth,
} = require("../controllers/whatsappController");

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
        cb(new Error("Only image files are allowed for chat messages"), false);
      }
    } else {
      // Allow excel files for blast messages
      cb(null, true);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

router.get("/qr-image/:sessionId", verifyToken, getQRImage);
router.post(
  "/send-message",
  verifyToken,
  upload.single("image"),
  sendMessageWA
);
router.post(
  "/upload/:sessionId",
  verifyToken,
  upload.single("excel"),
  uploadExcel
);
router.post("/logoutSession/:sessionId", verifyToken, logoutSession);
router.get("/sessions", verifyToken, getActiveSessions);
router.get("/contact-details/:sessionId/:jid", verifyToken, getContactDetails);
router.get("/health/:sessionId", verifyToken, getSessionHealth);

module.exports = router;
