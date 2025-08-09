const { getContactNameForSession } = require("./auth/session");

async function testContactResolution() {
  console.log("🧪 Testing Contact Name Resolution...\n");

  // Test data - replace with actual session ID and JIDs from your system
  const testCases = [
    {
      sessionId: "testing", // Replace with actual session ID
      jid: "6281384742399@s.whatsapp.net",
      description: "Regular contact",
    },
    {
      sessionId: "testing",
      jid: "6281234567890@s.whatsapp.net",
      description: "Another contact",
    },
  ];

  console.log("📋 Test Cases:");
  testCases.forEach((test, index) => {
    console.log(`   ${index + 1}. ${test.description}: ${test.jid}`);
  });
  console.log("");

  for (const testCase of testCases) {
    try {
      console.log(`🔍 Testing: ${testCase.description}`);
      console.log(`   JID: ${testCase.jid}`);
      console.log(`   Session: ${testCase.sessionId}`);

      const startTime = Date.now();
      const contactName = await getContactNameForSession(
        testCase.sessionId,
        testCase.jid
      );
      const duration = Date.now() - startTime;

      console.log(`   ✅ Result: "${contactName}"`);
      console.log(`   ⏱️ Duration: ${duration}ms`);

      // Analyze result
      if (contactName === testCase.jid.split("@")[0]) {
        console.log(`   📞 Using phone number fallback`);
      } else {
        console.log(`   👤 Found actual contact name!`);
      }
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }

    console.log("");
  }

  console.log("🎉 Contact resolution test completed!");
  console.log("\n💡 Tips to improve contact name resolution:");
  console.log("1. Make sure WhatsApp session is properly connected");
  console.log("2. Contacts should be saved in your WhatsApp");
  console.log("3. Try sending a message to the contact first");
  console.log("4. Business contacts might take longer to resolve");
  console.log(
    "5. Use the refresh endpoint: POST /contacts/{sessionId}/refresh"
  );
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\n⚠️ Test interrupted by user");
  process.exit(0);
});

testContactResolution().catch((error) => {
  console.error("❌ Test failed:", error);
  process.exit(1);
});
