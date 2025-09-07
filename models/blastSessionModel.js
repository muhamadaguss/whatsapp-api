const { DataTypes } = require("sequelize");
const sequelize = require("./db");

const BlastSession = sequelize.define(
  "BlastSession",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    sessionId: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      field: "session_id",
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "user_id",
    },
    whatsappSessionId: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: "whatsapp_session_id",
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "IDLE",
    },
    campaignName: {
      type: DataTypes.STRING(200),
      allowNull: true,
      field: "campaign_name",
    },
    messageTemplate: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: "message_template",
    },
    totalMessages: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: "total_messages",
    },
    currentIndex: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: "current_index",
    },
    sentCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: "sent_count",
    },
    failedCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: "failed_count",
    },
    skippedCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: "skipped_count",
    },
    progressPercentage: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 0.0,
      field: "progress_percentage",
    },
    estimatedCompletion: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "estimated_completion",
    },
    startedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "started_at",
    },
    pausedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "paused_at",
    },
    resumedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "resumed_at",
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "completed_at",
    },
    stoppedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "stopped_at",
    },
    errorMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "error_message",
    },
    config: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
  },
  {
    timestamps: true,
    tableName: "blast_sessions",
    underscored: true,
  }
);

// Associations will be defined after all models are loaded

// Instance methods
BlastSession.prototype.updateProgress = function () {
  const completed = this.sentCount + this.failedCount + this.skippedCount;
  this.progressPercentage =
    this.totalMessages > 0
      ? ((completed / this.totalMessages) * 100).toFixed(2)
      : 0;

  return this.save();
};

BlastSession.prototype.isActive = function () {
  return ["RUNNING", "PAUSED"].includes(this.status);
};

BlastSession.prototype.canResume = function () {
  return this.status === "PAUSED";
};

BlastSession.prototype.canPause = function () {
  return this.status === "RUNNING";
};

BlastSession.prototype.canStop = function () {
  return ["RUNNING", "PAUSED"].includes(this.status);
};

// Static methods
BlastSession.findActiveByUser = function (userId) {
  return this.findAll({
    where: {
      userId,
      status: ["RUNNING", "PAUSED"],
    },
    order: [["createdAt", "DESC"]],
  });
};

BlastSession.findBySessionId = function (sessionId) {
  return this.findOne({
    where: { sessionId },
  });
};

// Association with Session model (WhatsApp sessions)
BlastSession.associate = function(models) {
  BlastSession.belongsTo(models.Session, {
    foreignKey: 'whatsappSessionId',
    targetKey: 'sessionId',
    as: 'whatsappSession'
  });
};

module.exports = BlastSession;
