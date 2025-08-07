const ChatMessage = require("../models/chatModel");
const logger = require("../utils/logger");
const { asyncHandler, AppError } = require("../middleware/errorHandler");

const getAllChats = asyncHandler(async (req, res) => {
  const sessionId = req.params.sessionId;
  const chats = await ChatMessage.findAll({
    where: { sessionId },
    order: [["id", "ASC"]],
  });

  const groupedChats = {};

  for (const chat of chats) {
    const chatKey = chat.from; // Group by sender

    if (!groupedChats[chatKey]) {
      groupedChats[chatKey] = {
        id: null, // akan di-set nanti dengan format: `${sessionId}-${index}`
        name: chat.from,
        messages: [],
      };
    }

    groupedChats[chatKey].messages.push({
      id: `${chat.sessionId}-${groupedChats[chatKey].messages.length}`, // index sesuai urutan push
      text: chat.text,
      timestamp: chat.timestamp,
      fromMe: chat.fromMe,
    });
  }

  // Setelah semua pesan dikumpulkan, set ID grup berdasarkan sessionId dan index ke-nya
  let index = 0;
  for (const key in groupedChats) {
    groupedChats[key].id = `${
      groupedChats[key].messages[0].id.split("-")[0]
    }-${index}`;
    index++;
  }

  return res.status(200).json({
    status: "success",
    data: Object.values(groupedChats),
  });
});

module.exports = {
  getAllChats,
};
