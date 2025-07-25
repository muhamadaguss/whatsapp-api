const { DataTypes } = require("sequelize");
const sequelize = require("./db");

const ChatMessage = sequelize.define(
  "ChatMessage",
  {
    sessionId: DataTypes.STRING,
    from: DataTypes.STRING,
    text: DataTypes.TEXT,
    timestamp: DataTypes.DATE,
    fromMe: DataTypes.BOOLEAN,
  },
  {
    timestamps: true,
    tableName: "chat_messages",
  }
);

module.exports = ChatMessage;
