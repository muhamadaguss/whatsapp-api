const express = require("express");
const router = express.Router();
const {
  historyCampaign,
  getDataCampaign,
  getMessageTrends,
  getMessageTypePerformance,
} = require("../controllers/campaignController");
const { verifyToken } = require("../middleware/authMiddleware");

router.get("/historyCampaign", verifyToken, historyCampaign);
router.post("/getDataCampaign", verifyToken, getDataCampaign);
router.post("/getMessageTrends", verifyToken, getMessageTrends);
router.post(
  "/getMessageTypePerformance",
  verifyToken,
  getMessageTypePerformance
);

module.exports = router;
