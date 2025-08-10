const { getSock } = require("./auth/session");
const logger = require("./utils/logger");

// Debug script to test image download functionality
async function debugImageDownload(sessionId) {
  try {
    const sock = getSock(sessionId);
    if (!sock) {
      console.error(`❌ Session ${sessionId} not found or not active`);
      return;
    }

    console.log(`🔍 Debugging session: ${sessionId}`);
    console.log(`📱 User ID: ${sock.user?.id}`);
    console.log(`🔗 Connection state: ${sock.ws?.readyState}`);

    // Check if downloadMediaMessage function exists
    console.log(
      `📥 downloadMediaMessage available: ${
        typeof sock.downloadMediaMessage === "function"
      }`
    );

    // Check uploads directory
    const fs = require("fs");
    const path = require("path");
    const uploadsDir = path.join(__dirname, "uploads");

    console.log(`📁 Uploads directory: ${uploadsDir}`);
    console.log(`📁 Directory exists: ${fs.existsSync(uploadsDir)}`);

    if (fs.existsSync(uploadsDir)) {
      const files = fs.readdirSync(uploadsDir);
      console.log(`📁 Files in uploads: ${files.length}`);
      files.slice(0, 5).forEach((file) => {
        const filePath = path.join(uploadsDir, file);
        const stats = fs.statSync(filePath);
        console.log(`  - ${file} (${stats.size} bytes)`);
      });
    }

    // Test write permissions
    try {
      const testFile = path.join(uploadsDir, "test-write.txt");
      fs.writeFileSync(testFile, "test");
      fs.unlinkSync(testFile);
      console.log(`✅ Write permissions OK`);
    } catch (writeError) {
      console.error(`❌ Write permissions failed: ${writeError.message}`);
    }
  } catch (error) {
    console.error(`❌ Debug failed:`, error.message);
  }
}

// Get active sessions
function getActiveSessions() {
  const { getActiveSessionIds } = require("./auth/session");
  const sessions = getActiveSessionIds();
  console.log(`🔍 Active sessions: ${sessions.join(", ")}`);
  return sessions;
}

// Run debug if called directly
if (require.main === module) {
  const sessions = getActiveSessions();
  if (sessions.length > 0) {
    debugImageDownload(sessions[0]);
  } else {
    console.log("❌ No active sessions found");
  }
}

module.exports = { debugImageDownload, getActiveSessions };
