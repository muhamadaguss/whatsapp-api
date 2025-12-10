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
    const chatKey = chat.from; 
    if (!groupedChats[chatKey]) {
      groupedChats[chatKey] = {
        id: null, 
        name: chat.contactName || chat.from, 
        jid: chat.from, 
        messages: [],
      };
    }
    groupedChats[chatKey].messages.push({
      id: `${chat.sessionId}-${groupedChats[chatKey].messages.length}`, 
      text: chat.text,
      messageType: chat.messageType || "text",
      mediaUrl: chat.mediaUrl,
      timestamp: chat.timestamp,
      fromMe: chat.fromMe,
      isRead: chat.isRead,
    });
  }
  let index = 0;
  const chatList = [];
  for (const key in groupedChats) {
    const chat = groupedChats[key];
    chat.id = `${chat.messages[0].id.split("-")[0]}-${index}`;
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
  await ChatMessage.update(
    { isRead: true },
    {
      where: {
        sessionId,
        from: contactName,
        fromMe: false, 
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
