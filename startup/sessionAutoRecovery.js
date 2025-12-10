const logger = require("../utils/logger");
const sessionRecovery = require("../utils/sessionRecovery");
async function initializeSessionRecovery() {
  try {
    logger.info("🚀 Initializing session auto-recovery...");
    await new Promise(resolve => setTimeout(resolve, 5000));
    await sessionRecovery.cleanupOrphanedSessions();
    const recoveryResult = await sessionRecovery.recoverActiveSessions();
    await sessionRecovery.scheduleBusinessHoursCheck();
    logger.info("✅ Session auto-recovery initialization completed");
    return recoveryResult;
  } catch (error) {
    logger.error("❌ Session auto-recovery initialization failed:", error);
  }
}
module.exports = { initializeSessionRecovery };
if (require.main === module) {
  initializeSessionRecovery()
    .then(() => {
      console.log("Session recovery completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Session recovery failed:", error);
      process.exit(1);
    });
}
