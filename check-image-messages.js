const ChatMessage = require("./models/chatModel");
const { Op } = require("sequelize");

async function checkImageMessages() {
  try {
    const imageMessages = await ChatMessage.findAll({
      where: {
        messageType: "image",
      },
      limit: 5,
      order: [["createdAt", "DESC"]],
    });

    console.log("Recent image messages:");
    imageMessages.forEach((msg) => {
      console.log({
        id: msg.id,
        text: msg.text,
        messageType: msg.messageType,
        mediaUrl: msg.mediaUrl,
        fromMe: msg.fromMe,
        timestamp: msg.timestamp,
      });
    });

    if (imageMessages.length === 0) {
      console.log("No image messages found in database");
    }
  } catch (error) {
    console.error("Error:", error.message);
  }
  process.exit(0);
}

checkImageMessages();
