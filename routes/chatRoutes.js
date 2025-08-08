const express = require("express");
const router = express.Router();
const {
  getAllChats,
  markMessagesAsRead,
} = require("../controllers/chatController");

router.get("/:sessionId", getAllChats);
router.put("/:sessionId/:contactName/read", markMessagesAsRead);

module.exports = router;
