// models/subscriptionPlanModel.js
const { DataTypes } = require("sequelize");
const sequelize = require("./db");

const SubscriptionPlan = sequelize.define(
  "SubscriptionPlan",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
      comment: 'Internal plan name: free, starter, pro, enterprise',
    },
    displayName: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'User-facing plan name',
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Plan description',
    },
    
    // Pricing (reference only, not for actual billing yet)
    priceMonthly: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
      comment: 'Monthly price in specified currency',
    },
    priceYearly: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
      comment: 'Yearly price in specified currency',
    },
    currency: {
      type: DataTypes.STRING(10),
      defaultValue: 'IDR',
      comment: 'Currency code',
    },
    
    // Quotas
    quotas: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {
        maxWhatsappAccounts: 1,
        maxMessagesPerMonth: 1000,
        maxCampaignsPerMonth: 10,
        maxContacts: 1000,
        maxTemplates: 5,
        maxUsers: 1,
        maxStorageMb: 100,
        dailyMessageLimit: 100,
        concurrentBlasts: 1,
      },
      comment: 'Plan quota limits (JSON object)',
    },
    
    // Features
    features: {
      type: DataTypes.JSON,
      defaultValue: {
        spinText: false,
        advancedAnalytics: false,
        apiAccess: false,
        customBranding: false,
        prioritySupport: false,
        webhookIntegration: false,
        teamCollaboration: false,
        advancedScheduling: false,
      },
      comment: 'Plan feature flags (JSON object)',
    },
    
    // Display
    sortOrder: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Order for displaying plans (lower = first)',
    },
    isVisible: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: 'Whether to show plan in UI',
    },
    isPopular: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Mark as popular/recommended plan',
    },
  },
  {
    timestamps: true,
    tableName: "subscription_plans",
    indexes: [
      {
        fields: ["name"],
        unique: true,
        name: "idx_subscription_plans_name",
      },
      {
        fields: ["isVisible"],
        name: "idx_subscription_plans_is_visible",
      },
      {
        fields: ["sortOrder"],
        name: "idx_subscription_plans_sort_order",
      },
    ],
  }
);

module.exports = SubscriptionPlan;
