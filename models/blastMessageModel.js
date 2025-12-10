const { DataTypes, Op } = require("sequelize");
const sequelize = require("./db");
const BlastMessage = sequelize.define(
  "BlastMessage",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    sessionId: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: "session_id",
      references: {
        model: "blast_sessions",
        key: "session_id",
      },
    },
    messageIndex: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "message_index",
    },
    phone: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    contactName: {
      type: DataTypes.STRING(200),
      allowNull: true,
      field: "contact_name",
    },
    messageTemplate: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: "message_template",
    },
    finalMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "final_message",
    },
    variables: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "pending",
    },
    whatsappMessageId: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "whatsapp_message_id",
    },
    retryCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: "retry_count",
    },
    maxRetries: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 3,
      field: "max_retries",
    },
    errorMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "error_message",
    },
    scheduledAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "scheduled_at",
    },
    processingStartedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "processing_started_at",
    },
    sentAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "sent_at",
    },
    failedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "failed_at",
    },
  },
  {
    timestamps: true,
    tableName: "blast_messages",
    underscored: true,
  }
);
BlastMessage.prototype.canRetry = function () {
  return this.status === "failed" && this.retryCount < this.maxRetries;
};
BlastMessage.prototype.markAsProcessing = function () {
  this.status = "processing";
  this.processingStartedAt = new Date();
  return this.save();
};
BlastMessage.prototype.markAsSent = function (whatsappMessageId) {
  this.status = "sent";
  this.whatsappMessageId = whatsappMessageId;
  this.sentAt = new Date();
  return this.save();
};
BlastMessage.prototype.markAsFailed = function (errorMessage) {
  this.status = "failed";
  this.errorMessage = errorMessage;
  this.failedAt = new Date();
  this.retryCount += 1;
  return this.save();
};
BlastMessage.prototype.markAsSkipped = function (reason) {
  this.status = "skipped";
  this.errorMessage = reason;
  return this.save();
};
BlastMessage.findPendingBySession = function (sessionId, limit = null) {
  const options = {
    where: {
      sessionId,
      status: "pending",
    },
    order: [["messageIndex", "ASC"]],
  };
  if (limit) {
    options.limit = limit;
  }
  return this.findAll(options);
};
BlastMessage.findRetryableBySession = function (sessionId, limit = null) {
  const options = {
    where: {
      sessionId,
      status: "failed",
      retryCount: {
        [Op.lt]: sequelize.col("max_retries"),
      },
    },
    order: [["messageIndex", "ASC"]],
  };
  if (limit) {
    options.limit = limit;
  }
  return this.findAll(options);
};
BlastMessage.getSessionStats = function (sessionId) {
  return this.findAll({
    where: { sessionId },
    attributes: ["status", [sequelize.fn("COUNT", "*"), "count"]],
    group: ["status"],
    raw: true,
  });
};
BlastMessage.findNextToProcess = function (sessionId, currentIndex) {
  return this.findOne({
    where: {
      sessionId,
      messageIndex: {
        [Op.gt]: currentIndex,
      },
      status: ["pending", "failed"],
    },
    order: [["messageIndex", "ASC"]],
  });
};
module.exports = BlastMessage;
