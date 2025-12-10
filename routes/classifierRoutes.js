const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/authMiddleware");
const {
  testClassification,
  batchTestClassification,
  getClassifierConfig,
} = require("../controllers/classifierController");
router.post("/test", verifyToken, testClassification);
router.post("/batch-test", verifyToken, batchTestClassification);
router.get("/config", verifyToken, getClassifierConfig);
module.exports = router;
