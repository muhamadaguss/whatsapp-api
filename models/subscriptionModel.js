// models/subscriptionModel.js
const { DataTypes } = require("sequelize");
const sequelize = require("./db");

const Subscription = sequelize.define(
  "Subscription",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    organizationId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'organizations',
        key: 'id',
      },
      onDelete: 'CASCADE',
      comment: 'Organization this subscription belongs to',
    },
    planId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'subscription_plans',
        key: 'id',
      },
      comment: 'Subscription plan reference',
    },
    
    // Status
    status: {
      type: DataTypes.ENUM('active', 'cancelled', 'expired', 'trial'),
      defaultValue: 'trial',
      comment: 'Current subscription status',
    },
    
    // Dates
    startsAt: {
      type: DataTypes.DATE,
      allowNull: false,
      comment: 'Subscription start date',
    },
    endsAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Subscription end date (null for lifetime)',
    },
    trialEndsAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Trial period end date',
    },
    cancelledAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Timestamp when subscription was cancelled',
    },
    
    // Billing
    billingCycle: {
      type: DataTypes.ENUM('monthly', 'yearly', 'lifetime'),
      defaultValue: 'monthly',
      comment: 'Billing cycle type',
    },
    autoRenew: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: 'Whether subscription auto-renews',
    },
    
    // Metadata
    metadata: {
      type: DataTypes.JSON,
      defaultValue: {},
      comment: 'Additional subscription data (JSON object)',
    },
  },
  {
    timestamps: true,
    tableName: "subscriptions",
    underscored: true, // Use snake_case for column names in database
    indexes: [
      {
        fields: ["organization_id"],
        name: "idx_subscriptions_organization_id",
      },
      {
        fields: ["plan_id"],
        name: "idx_subscriptions_plan_id",
      },
      {
        fields: ["status"],
        name: "idx_subscriptions_status",
      },
      {
        fields: ["starts_at"],
        name: "idx_subscriptions_starts_at",
      },
      {
        fields: ["ends_at"],
        name: "idx_subscriptions_ends_at",
      },
    ],
  }
);

module.exports = Subscription;
