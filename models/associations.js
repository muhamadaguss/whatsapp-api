/**
 * Model Associations Setup
 * Defines all relationships between models
 */

const User = require("./userModel");
const Session = require("./sessionModel");
const Blast = require("./blastModel");
const ChatMessage = require("./chatModel");
const Template = require("./templateModel");
const MenuItem = require("./menuModel");
const MessageStatus = require("./messageStatusModel");
const BlacklistedToken = require("./blacklistedTokenModel");
const BlastSession = require("./blastSessionModel");
const BlastMessage = require("./blastMessageModel");

// SaaS Multi-tenant Models
const Organization = require("./organizationModel");
const SubscriptionPlan = require("./subscriptionPlanModel");
const Subscription = require("./subscriptionModel");
const UsageTracking = require("./usageTrackingModel");
const QuotaAlert = require("./quotaAlertModel");

/**
 * Setup all model associations
 */
function setupAssociations() {
  // User associations
  User.hasMany(Session, { foreignKey: "userId", as: "sessions" });
  User.hasMany(Blast, { foreignKey: "userId", as: "blasts" });
  User.hasMany(Template, { foreignKey: "userId", as: "templates" });
  User.hasMany(BlastSession, { foreignKey: "userId", as: "blastSessions" });

  // Session associations
  Session.belongsTo(User, { foreignKey: "userId", as: "sessionUser" });

  // Blast associations
  Blast.belongsTo(User, { foreignKey: "userId", as: "blastUser" });

  // Template associations
  Template.belongsTo(User, { foreignKey: "userId", as: "templateUser" });

  // BlastSession associations
  BlastSession.belongsTo(User, {
    foreignKey: "userId",
    as: "blastSessionUser",
  });
  BlastSession.hasMany(BlastMessage, {
    foreignKey: "sessionId",
    sourceKey: "sessionId",
    as: "messages",
  });

  // BlastMessage associations
  BlastMessage.belongsTo(BlastSession, {
    foreignKey: "sessionId",
    targetKey: "sessionId",
    as: "session",
  });

  // ============================================
  // SaaS Multi-Tenant Associations
  // ============================================

  // Organization associations (One-to-Many relationships)
  Organization.hasMany(User, {
    foreignKey: "organizationId",
    as: "users",
  });
  Organization.hasMany(Session, {
    foreignKey: "organizationId",
    as: "whatsappSessions",
  });
  Organization.hasMany(BlastSession, {
    foreignKey: "organization_id",
    as: "blastSessions",
  });
  Organization.hasMany(BlastMessage, {
    foreignKey: "organization_id",
    as: "blastMessages",
  });
  Organization.hasMany(Template, {
    foreignKey: "organizationId",
    as: "templates",
  });
  Organization.hasMany(ChatMessage, {
    foreignKey: "organizationId",
    as: "chatMessages",
  });
  Organization.hasMany(Subscription, {
    foreignKey: "organizationId",
    as: "subscriptions",
  });
  Organization.hasMany(UsageTracking, {
    foreignKey: "organizationId",
    as: "usageRecords",
  });
  Organization.hasMany(QuotaAlert, {
    foreignKey: "organizationId",
    as: "quotaAlerts",
  });

  // User belongsTo Organization
  User.belongsTo(Organization, {
    foreignKey: "organizationId",
    as: "organization",
  });

  // Session belongsTo Organization
  Session.belongsTo(Organization, {
    foreignKey: "organizationId",
    as: "organization",
  });

  // BlastSession belongsTo Organization
  BlastSession.belongsTo(Organization, {
    foreignKey: "organization_id",
    as: "organization",
  });

  // BlastMessage belongsTo Organization
  BlastMessage.belongsTo(Organization, {
    foreignKey: "organization_id",
    as: "organization",
  });

  // Template belongsTo Organization
  Template.belongsTo(Organization, {
    foreignKey: "organizationId",
    as: "organization",
  });

  // ChatMessage belongsTo Organization
  ChatMessage.belongsTo(Organization, {
    foreignKey: "organizationId",
    as: "organization",
  });

  // Subscription associations
  Subscription.belongsTo(Organization, {
    foreignKey: "organizationId",
    as: "organization",
  });
  Subscription.belongsTo(SubscriptionPlan, {
    foreignKey: "planId",
    as: "plan",
  });

  // SubscriptionPlan has many Subscriptions
  SubscriptionPlan.hasMany(Subscription, {
    foreignKey: "planId",
    as: "subscriptions",
  });

  // UsageTracking belongsTo Organization
  UsageTracking.belongsTo(Organization, {
    foreignKey: "organizationId",
    as: "organization",
  });

  // QuotaAlert belongsTo Organization
  QuotaAlert.belongsTo(Organization, {
    foreignKey: "organizationId",
    as: "organization",
  });

  // Organization belongsTo User (owner relationship)
  Organization.belongsTo(User, {
    foreignKey: "ownerId",
    as: "owner",
  });

  console.log("✅ Model associations setup completed (including SaaS multi-tenant models)");
}

module.exports = { setupAssociations };
