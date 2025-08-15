const express = require("express");
const router = express.Router();
const {
  previewSpinText,
  validateSpinText,
  generateVariations,
} = require("../controllers/spinTextController");
const { verifyToken } = require("../middleware/authMiddleware");

// Apply auth middleware to all routes
router.use(verifyToken);

// POST /api/spin-text/preview
router.post("/preview", previewSpinText);

// POST /api/spin-text/validate
router.post("/validate", validateSpinText);

// POST /api/spin-text/generate
router.post("/generate", generateVariations);

module.exports = router;
