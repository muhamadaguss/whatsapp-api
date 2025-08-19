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

  console.log("✅ Model associations setup completed");
}

module.exports = { setupAssociations };
