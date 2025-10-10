// models/quotaAlertModel.js
const { DataTypes } = require("sequelize");
const sequelize = require("./db");

const QuotaAlert = sequelize.define(
  "QuotaAlert",
  {
    id: {
      type: DataTypes.INTEGER,
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
      comment: 'Organization this alert belongs to',
    },
    
    // Alert details
    quotaType: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: 'Type: messages, accounts, storage, etc',
    },
    currentUsage: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'Current usage value',
    },
    quotaLimit: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'Maximum allowed value',
    },
    percentageUsed: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      comment: 'Percentage: 0.00 - 100.00',
    },
    
    // Alert level
    alertLevel: {
      type: DataTypes.ENUM('warning', 'critical', 'exceeded'),
      allowNull: false,
      comment: 'warning: 80%, critical: 95%, exceeded: 100%',
    },
    
    // Status
    isResolved: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Whether this alert has been resolved',
    },
    resolvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'When this alert was resolved',
    },
    
    // Notification
    notificationSent: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Whether notification has been sent',
    },
    notificationSentAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'When notification was sent',
    },
  },
  {
    timestamps: true,
    tableName: "quota_alerts",
    underscored: true, // Use snake_case for column names in database
    indexes: [
      {
        fields: ["organizationId"],
        name: "idx_quota_alerts_organization_id",
      },
      {
        fields: ["quotaType"],
        name: "idx_quota_alerts_quota_type",
      },
      {
        fields: ["alertLevel"],
        name: "idx_quota_alerts_alert_level",
      },
      {
        fields: ["isResolved"],
        name: "idx_quota_alerts_is_resolved",
      },
    ],
  }
);

module.exports = QuotaAlert;
