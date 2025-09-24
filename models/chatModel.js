const { DataTypes } = require("sequelize");
const sequelize = require("./db");

const ChatMessage = sequelize.define(
  "ChatMessage",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    // ✨ NEW: Add WhatsApp message ID for deduplication
    messageId: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true, // Prevent duplicate WhatsApp messages
    },
    sessionId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    from: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    contactName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    text: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    messageType: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "text",
    },
    mediaUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    timestamp: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    fromMe: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    isRead: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    timestamps: true,
    tableName: "chat_messages",
    // ✨ NEW: Add composite index for better deduplication
    indexes: [
      {
        unique: true,
        fields: ['messageId'],
        name: 'chat_messages_messageId_unique'
      },
      {
        // Index untuk query performance
        fields: ['sessionId', 'timestamp'],
        name: 'chat_messages_session_timestamp_idx'
      }
    ]
  }
);

module.exports = ChatMessage;
