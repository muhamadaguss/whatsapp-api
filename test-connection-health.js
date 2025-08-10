const { getSock, getActiveSessionIds } = require("./auth/session");
const {
  checkSessionHealth,
  logSessionHealth,
} = require("./utils/connectionHealth");

async function testConnectionHealth() {
  console.log("🔍 Testing WhatsApp connection health...");

  const sessions = getActiveSessionIds();

  if (sessions.length === 0) {
    console.log("❌ No active sessions found");
    return;
  }

  console.log(
    `📱 Found ${sessions.length} active session(s): ${sessions.join(", ")}`
  );

  for (const sessionId of sessions) {
    console.log(`\n🔍 Checking session: ${sessionId}`);

    const sock = getSock(sessionId);
    if (!sock) {
      console.log(`❌ Socket not found for session ${sessionId}`);
      continue;
    }

    const health = logSessionHealth(sock, sessionId);

    if (health.isHealthy) {
      console.log(`✅ Session ${sessionId} is healthy and ready for messaging`);
    } else {
      console.log(`⚠️ Session ${sessionId} has issues:`);
      health.issues.forEach((issue) => {
        console.log(`  - ${issue}`);
      });

      console.log("🔧 Recommendations:");
      if (
        health.issues.includes("User not authenticated - QR code not scanned")
      ) {
        console.log("  - Scan QR code to authenticate");
      }
      if (health.issues.some((issue) => issue.includes("WebSocket"))) {
        console.log("  - Check internet connection");
        console.log("  - Restart WhatsApp session");
      }
    }
  }

  console.log("\n📋 Health check completed");
}

// Test specific session if provided as argument
const sessionId = process.argv[2];
if (sessionId) {
  console.log(`🔍 Testing specific session: ${sessionId}`);
  const sock = getSock(sessionId);
  if (sock) {
    logSessionHealth(sock, sessionId);
  } else {
    console.log(`❌ Session ${sessionId} not found`);
  }
} else {
  testConnectionHealth();
}
