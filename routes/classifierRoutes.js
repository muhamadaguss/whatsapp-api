const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/authMiddleware");
const {
  testClassification,
  batchTestClassification,
  getClassifierConfig,
} = require("../controllers/classifierController");

// Test single message classification
router.post("/test", verifyToken, testClassification);

// Batch test multiple messages
router.post("/batch-test", verifyToken, batchTestClassification);

// Get classifier configuration
router.get("/config", verifyToken, getClassifierConfig);

module.exports = router;
