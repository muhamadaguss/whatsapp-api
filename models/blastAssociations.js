/**
 * Blast Model Associations Setup
 * Only defines relationships for blast session models to avoid conflicts
 */

const BlastSession = require("./blastSessionModel");
const BlastMessage = require("./blastMessageModel");

/**
 * Setup blast model associations only
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

    console.log("✅ Blast model associations setup completed");
    return true;
  } catch (error) {
    console.warn("⚠️ Blast associations could not be setup:", error.message);
    return false;
  }
}

module.exports = { setupBlastAssociations };
