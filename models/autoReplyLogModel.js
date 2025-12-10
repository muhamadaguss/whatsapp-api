const { DataTypes } = require("sequelize");
const sequelize = require("./db");

const AutoReplyLog = sequelize.define(
  "AutoReplyLog",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    blastId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "blast_id",
    },
    customerPhone: {
      type: DataTypes.STRING(20),
      allowNull: false,
      field: "customer_phone",
    },
    customerName: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "customer_name",
    },
    customerMessage: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: "customer_message",
    },
    detectedCategory: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: "detected_category",
    },
    botResponse: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: "bot_response",
    },
    responseDelay: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "response_delay",
      comment: "Delay in seconds before sending response",
    },
    repliedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: "replied_at",
    },
    notifiedCollector: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: "notified_collector",
    },
  },
  {
    timestamps: true,
    tableName: "auto_reply_logs",
  }
);

AutoReplyLog.associate = function (models) {
  AutoReplyLog.belongsTo(models.Blast, {
    foreignKey: "blastId",
    as: "blast",
  });
};

module.exports = AutoReplyLog;
