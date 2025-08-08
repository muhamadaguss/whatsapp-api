const { getSock, getContactDetails } = require("./auth/session");

async function testContactDetails() {
  console.log("🧪 Testing contact details functionality...");

  // Get first available session
  const sessions = require("./auth/session").getActiveSessionIds();
  if (sessions.length === 0) {
    console.log("❌ No active sessions found. Please start a session first.");
    return;
  }

  const sessionId = sessions[0];
  const sock = getSock(sessionId);

  if (!sock) {
    console.log("❌ Socket not found for session:", sessionId);
    return;
  }

  // Test with a sample JID (replace with actual JID)
  const testJid = "6281234567890@s.whatsapp.net"; // Replace with actual JID

  try {
    console.log(`📞 Testing contact details for: ${testJid}`);
    const details = await getContactDetails(sock, testJid);

    console.log("✅ Contact details retrieved successfully:");
    console.log(JSON.stringify(details, null, 2));
  } catch (error) {
    console.error("❌ Error testing contact details:", error.message);
  }
}

// Run test if this file is executed directly
if (require.main === module) {
  testContactDetails().catch(console.error);
}

module.exports = { testContactDetails };
