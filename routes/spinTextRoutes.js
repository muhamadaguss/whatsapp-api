const express = require("express");
const router = express.Router();
const {
  previewSpinText,
  validateSpinText,
  generateVariations,
} = require("../controllers/spinTextController");
const { verifyToken } = require("../middleware/authMiddleware");
router.use(verifyToken);
router.post("/preview", previewSpinText);
router.post("/validate", validateSpinText);
router.post("/generate", generateVariations);
module.exports = router;
