const logger = require("../utils/logger");
const sessionRecovery = require("../utils/sessionRecovery");

/**
 * Auto-recovery script to run on server startup
 * Add this to your main server file or startup script
 */
async function initializeSessionRecovery() {
  try {
    logger.info("🚀 Initializing session auto-recovery...");
    
    // Wait a bit for database connections to be ready
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Clean up orphaned sessions first
    await sessionRecovery.cleanupOrphanedSessions();
    
    // Recover active sessions
    const recoveryResult = await sessionRecovery.recoverActiveSessions();
    
    // Schedule business hours checks for paused sessions
    await sessionRecovery.scheduleBusinessHoursCheck();
    
    logger.info("✅ Session auto-recovery initialization completed");
    return recoveryResult;
    
  } catch (error) {
    logger.error("❌ Session auto-recovery initialization failed:", error);
    // Don't throw error to prevent server startup failure
  }
}

// Export for use in main server file
module.exports = { initializeSessionRecovery };

// If run directly
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