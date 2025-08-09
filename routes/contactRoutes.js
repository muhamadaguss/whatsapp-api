const express = require("express");
const router = express.Router();
const {
  refreshContactNames,
  getContactNameForSession,
} = require("../auth/session");
const { asyncHandler } = require("../middleware/errorHandler");

// Refresh contact names for a session
const refreshContacts = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;

  if (!sessionId) {
    return res.status(400).json({
      status: "error",
      message: "Session ID is required",
    });
  }

  const result = await refreshContactNames(sessionId);

  if (result.success) {
    return res.status(200).json({
      status: "success",
      message: `Contact names refreshed successfully`,
      data: {
        updatedCount: result.updatedCount,
      },
    });
  } else {
    return res.status(500).json({
      status: "error",
      message: result.error,
    });
  }
});

// Get contact name for specific JID
const getContactName = asyncHandler(async (req, res) => {
  const { sessionId, jid } = req.params;

  if (!sessionId || !jid) {
    return res.status(400).json({
      status: "error",
      message: "Session ID and JID are required",
    });
  }

  const contactName = await getContactNameForSession(sessionId, jid);

  return res.status(200).json({
    status: "success",
    data: {
      jid,
      contactName,
      phoneNumber: jid.split("@")[0],
    },
  });
});

router.post("/:sessionId/refresh", refreshContacts);
router.get("/:sessionId/:jid", getContactName);

module.exports = router;
