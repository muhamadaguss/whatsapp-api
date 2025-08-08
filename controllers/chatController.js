const ChatMessage = require("../models/chatModel");
const { Op } = require("sequelize");
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
        name: chat.contactName || chat.from, // Use contactName if available, fallback to JID
        jid: chat.from, // Keep JID for reference
        messages: [],
      };
    }

    groupedChats[chatKey].messages.push({
      id: `${chat.sessionId}-${groupedChats[chatKey].messages.length}`, // index sesuai urutan push
      text: chat.text,
      timestamp: chat.timestamp,
      fromMe: chat.fromMe,
      isRead: chat.isRead,
    });
  }

  // Setelah semua pesan dikumpulkan, set ID grup berdasarkan sessionId dan index ke-nya
  let index = 0;
  const chatList = [];

  for (const key in groupedChats) {
    const chat = groupedChats[key];
    chat.id = `${chat.messages[0].id.split("-")[0]}-${index}`;

    // Hitung unread messages (pesan yang bukan dari saya dan belum dibaca)
    const unreadCount = chat.messages.filter(
      (msg) => !msg.fromMe && !msg.isRead
    ).length;
    chat.unreadCount = unreadCount;

    chatList.push(chat);
    index++;
  }

  return res.status(200).json({
    status: "success",
    data: chatList,
  });
});

const markMessagesAsRead = asyncHandler(async (req, res) => {
  const { sessionId, contactName } = req.params;

  // Mark all messages from this contact as read
  await ChatMessage.update(
    { isRead: true },
    {
      where: {
        sessionId,
        from: contactName,
        fromMe: false, // Only mark incoming messages as read
        isRead: false,
      },
    }
  );

  return res.status(200).json({
    status: "success",
    message: "Messages marked as read",
  });
});

module.exports = {
  getAllChats,
  markMessagesAsRead,
};
