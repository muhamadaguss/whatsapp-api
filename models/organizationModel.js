// models/organizationModel.js
const { DataTypes } = require("sequelize");
const sequelize = require("./db");

const Organization = sequelize.define(
  "Organization",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'Organization/Company name',
    },
    slug: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
      comment: 'URL-friendly identifier for organization',
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true,
      },
      comment: 'Primary contact email',
    },
    phone: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Contact phone number',
    },
    
    // Owner reference
    ownerId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id',
      },
      comment: 'User who owns this organization',
    },
    
    // Subscription info (denormalized for quick access)
    subscriptionPlan: {
      type: DataTypes.ENUM('free', 'starter', 'pro', 'enterprise'),
      defaultValue: 'free',
      comment: 'Current subscription plan',
    },
    subscriptionStatus: {
      type: DataTypes.ENUM('active', 'suspended', 'cancelled', 'trial'),
      defaultValue: 'trial',
      comment: 'Current subscription status',
    },
    trialEndsAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Trial period end date',
    },
    subscriptionStartsAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Subscription start date',
    },
    subscriptionEndsAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Subscription end date',
    },
    
    // Settings
    settings: {
      type: DataTypes.JSON,
      defaultValue: {},
      comment: 'Organization-specific settings and preferences',
    },
    timezone: {
      type: DataTypes.STRING(100),
      defaultValue: 'Asia/Jakarta',
      comment: 'Organization timezone',
    },
    currency: {
      type: DataTypes.STRING(10),
      defaultValue: 'IDR',
      comment: 'Preferred currency code',
    },
    
    // Status
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: 'Whether organization is active',
    },
    suspendedReason: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Reason for suspension if suspended',
    },
    suspendedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Timestamp when organization was suspended',
    },
    
    // Soft delete
    deletedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Soft delete timestamp',
    },
  },
  {
    timestamps: true,
    paranoid: true, // Enable soft delete
    tableName: "organizations",
    indexes: [
      {
        fields: ["slug"],
        name: "idx_organizations_slug",
      },
      {
        fields: ["email"],
        name: "idx_organizations_email",
      },
      {
        fields: ["ownerId"],
        name: "idx_organizations_owner_id",
      },
      {
        fields: ["subscriptionPlan"],
        name: "idx_organizations_subscription_plan",
      },
      {
        fields: ["subscriptionStatus"],
        name: "idx_organizations_subscription_status",
      },
      {
        fields: ["isActive"],
        name: "idx_organizations_is_active",
      },
    ],
  }
);

module.exports = Organization;
