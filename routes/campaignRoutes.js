const express = require("express");
const router = express.Router();
const {
  historyCampaign,
  getDataCampaign,
  getMessageTrends,
  getMessageTypePerformance,
} = require("../controllers/campaignController");
const { verifyToken } = require("../middleware/authMiddleware");
const { tenantContext } = require("../middleware/tenantContext");
const { withTenantContext } = require("../middleware/tenantIsolation");

router.get("/historyCampaign", verifyToken, tenantContext, withTenantContext, historyCampaign);
router.post("/getDataCampaign", verifyToken, tenantContext, withTenantContext, getDataCampaign);
router.post("/getMessageTrends", verifyToken, tenantContext, withTenantContext, getMessageTrends);
router.post(
  "/getMessageTypePerformance",
  verifyToken,
  tenantContext,
  withTenantContext,
  getMessageTypePerformance
);

module.exports = router;
