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
function setupAssociations() {
  User.hasMany(Session, { foreignKey: "userId", as: "sessions" });
  User.hasMany(Blast, { foreignKey: "userId", as: "blasts" });
  User.hasMany(Template, { foreignKey: "userId", as: "templates" });
  User.hasMany(BlastSession, { foreignKey: "userId", as: "blastSessions" });
  Session.belongsTo(User, { foreignKey: "userId", as: "sessionUser" });
  Blast.belongsTo(User, { foreignKey: "userId", as: "blastUser" });
  Template.belongsTo(User, { foreignKey: "userId", as: "templateUser" });
  BlastSession.belongsTo(User, {
    foreignKey: "userId",
    as: "blastSessionUser",
  });
  BlastSession.hasMany(BlastMessage, {
    foreignKey: "sessionId",
    sourceKey: "sessionId",
    as: "messages",
  });
  BlastMessage.belongsTo(BlastSession, {
    foreignKey: "sessionId",
    targetKey: "sessionId",
    as: "session",
  });
  console.log("✅ Model associations setup completed");
}
module.exports = { setupAssociations };
