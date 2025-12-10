const BlastSession = require("./blastSessionModel");
const BlastMessage = require("./blastMessageModel");
const Session = require("./sessionModel");
function setupBlastAssociations() {
  try {
    BlastSession.hasMany(BlastMessage, {
      foreignKey: "sessionId",
      sourceKey: "sessionId",
      as: "messages",
    });
    BlastMessage.belongsTo(BlastSession, {
      foreignKey: "sessionId",
      targetKey: "sessionId",
      as: "blastSession",
    });
    BlastSession.belongsTo(Session, {
      foreignKey: 'whatsappSessionId',
      targetKey: 'sessionId',
      as: 'whatsappSession'
    });
    Session.hasMany(BlastSession, {
      foreignKey: 'whatsappSessionId',
      sourceKey: 'sessionId',
      as: 'blastSessions'
    });
    console.log("✅ Blast model associations setup completed");
    return true;
  } catch (error) {
    console.warn("⚠️ Blast associations could not be setup:", error.message);
    return false;
  }
}
module.exports = { setupBlastAssociations };
