/**
 * Blast Model Associations Setup
 * Defines relationships for blast session models and WhatsApp sessions
 */

const BlastSession = require("./blastSessionModel");
const BlastMessage = require("./blastMessageModel");
const Session = require("./sessionModel");

/**
 * Setup blast model associations
 */
function setupBlastAssociations() {
  try {
    // BlastSession to BlastMessage relationship
    BlastSession.hasMany(BlastMessage, {
      foreignKey: "sessionId",
      sourceKey: "sessionId",
      as: "messages",
    });

    // BlastMessage to BlastSession relationship
    BlastMessage.belongsTo(BlastSession, {
      foreignKey: "sessionId",
      targetKey: "sessionId",
      as: "blastSession",
    });

    // BlastSession to Session (WhatsApp) relationship
    BlastSession.belongsTo(Session, {
      foreignKey: 'whatsappSessionId',
      targetKey: 'sessionId',
      as: 'whatsappSession'
    });

    // Session to BlastSession relationship (optional, for reverse queries)
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
