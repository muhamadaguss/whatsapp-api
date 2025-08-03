// models/messageStatusModel.js
const { DataTypes } = require("sequelize");
const sequelize = require("./db");

const MessageStatus = sequelize.define(
  "MessageStatus",
  {
    messageId: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
    },
    sessionId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: "",
    },
    status: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    deliveredAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    readAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    timestamps: true,
    tableName: "message_statuses",
  }
);

module.exports = MessageStatus;
