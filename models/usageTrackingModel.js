// models/usageTrackingModel.js
const { DataTypes } = require("sequelize");
const sequelize = require("./db");

const UsageTracking = sequelize.define(
  "UsageTracking",
  {
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
    },
    organizationId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'organizations',
        key: 'id',
      },
      onDelete: 'CASCADE',
      comment: 'Organization this usage belongs to',
    },
    
    // Metrics
    metricType: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: 'Type: messages_sent, whatsapp_accounts, storage_used, api_calls, etc',
    },
    metricValue: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Current value of the metric',
    },
    
    // Metadata
    metadata: {
      type: DataTypes.JSON,
      defaultValue: {},
      comment: 'Additional context: sessionId, campaignId, etc (JSON object)',
    },
    
    // Period tracking
    periodType: {
      type: DataTypes.ENUM('daily', 'monthly', 'yearly'),
      defaultValue: 'monthly',
      comment: 'Type of period being tracked',
    },
    periodStart: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      comment: 'Start date of tracking period',
    },
    periodEnd: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      comment: 'End date of tracking period',
    },
    
    // Recording time
    recordedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      comment: 'When this usage was recorded',
    },
  },
  {
    timestamps: true,
    updatedAt: false, // Only track creation, not updates
    tableName: "usage_tracking",
    underscored: true, // Use snake_case for column names in database
    indexes: [
      {
        fields: ["organizationId", "metricType"],
        name: "idx_usage_tracking_org_metric",
      },
      {
        fields: ["periodStart", "periodEnd"],
        name: "idx_usage_tracking_period",
      },
      {
        fields: ["metricType"],
        name: "idx_usage_tracking_metric_type",
      },
      {
        fields: ["recordedAt"],
        name: "idx_usage_tracking_recorded_at",
      },
    ],
  }
);

module.exports = UsageTracking;
