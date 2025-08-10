// Debug script specifically for 'testing' session
const { getSock } = require("./auth/session");
const {
  checkSessionHealth,
  logSessionHealth,
} = require("./utils/connectionHealth");

async function debugTestingSession() {
  console.log('🔍 Debugging "testing" session...');
  console.log("================================\n");

  const sessionId = "testing";
  const sock = getSock(sessionId);

  if (!sock) {
    console.log('❌ Session "testing" not found');
    console.log("\n🔧 Possible solutions:");
    console.log("1. Start WhatsApp session first");
    console.log('2. Scan QR code for session "testing"');
    console.log("3. Check if session is properly initialized");
    return;
  }

  console.log('✅ Session "testing" found');
  console.log("\n📊 Session Details:");
  console.log(`- Has user: ${!!sock.user}`);
  console.log(`- User ID: ${sock.user?.id || "Not set"}`);
  console.log(`- Has sendMessage: ${typeof sock.sendMessage === "function"}`);
  console.log(`- Has WebSocket: ${!!sock.ws}`);

  if (sock.ws) {
    console.log(`- WebSocket state: ${sock.ws.readyState}`);
    const stateNames = ["CONNECTING", "OPEN", "CLOSING", "CLOSED"];
    console.log(
      `- WebSocket state name: ${stateNames[sock.ws.readyState] || "UNKNOWN"}`
    );
  }

  console.log("\n🔍 Health Check (Strict Mode):");
  const healthStrict = checkSessionHealth(sock, sessionId, false);
  console.log(`- Is Healthy: ${healthStrict.isHealthy ? "✅ Yes" : "❌ No"}`);
  console.log(
    `- Issues: ${
      healthStrict.issues.length > 0 ? healthStrict.issues.join(", ") : "None"
    }`
  );

  console.log("\n🔍 Health Check (Permissive Mode):");
  const healthPermissive = checkSessionHealth(sock, sessionId, true);
  console.log(
    `- Is Healthy: ${healthPermissive.isHealthy ? "✅ Yes" : "❌ No"}`
  );
  console.log(
    `- Issues: ${
      healthPermissive.issues.length > 0
        ? healthPermissive.issues.join(", ")
        : "None"
    }`
  );
  console.log(`- Note: ${healthPermissive.details.note || "None"}`);

  console.log("\n📋 Detailed Health Report:");
  logSessionHealth(sock, sessionId);

  console.log("\n🎯 Recommendations:");
  if (!sock.user || !sock.user.id) {
    console.log("- ⚠️ Session not authenticated - scan QR code");
  }

  if (sock.ws && sock.ws.readyState !== 1) {
    console.log("- ⚠️ WebSocket not in OPEN state - check connection");
  }

  if (!sock.ws) {
    console.log("- ⚠️ No WebSocket reference - session might be initializing");
  }

  if (healthPermissive.isHealthy) {
    console.log("- ✅ Session should work with permissive mode");
    console.log("- 💡 Try sending a test message");
  } else {
    console.log("- ❌ Session needs attention before use");
    console.log("- 🔄 Consider restarting the session");
  }
}

debugTestingSession().catch(console.error);
