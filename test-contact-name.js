const ChatMessage = require("./models/chatModel");

async function testContactNameFeature() {
  try {
    console.log("🧪 Testing Contact Name Feature...\n");

    // Test 1: Check if contactName column exists
    console.log("1. Testing database schema...");
    const sampleMessage = await ChatMessage.findOne();
    if (sampleMessage) {
      console.log("✅ Database accessible");
      console.log("Sample message structure:", {
        id: sampleMessage.id,
        from: sampleMessage.from,
        contactName: sampleMessage.contactName,
        text: sampleMessage.text?.substring(0, 30) + "...",
        fromMe: sampleMessage.fromMe,
      });
    } else {
      console.log("ℹ️ No messages in database yet");
    }

    // Test 2: Check contact name resolution
    console.log("\n2. Testing contact name resolution...");
    const messagesWithContactName = await ChatMessage.findAll({
      where: {
        contactName: {
          [require("sequelize").Op.ne]: null,
        },
      },
      limit: 5,
    });

    console.log(
      `✅ Found ${messagesWithContactName.length} messages with contact names:`
    );
    messagesWithContactName.forEach((msg) => {
      console.log(`   - ${msg.contactName} (${msg.from})`);
    });

    // Test 3: Check messages without contact names
    console.log("\n3. Testing fallback behavior...");
    const messagesWithoutContactName = await ChatMessage.findAll({
      where: {
        contactName: null,
      },
      limit: 5,
    });

    console.log(
      `ℹ️ Found ${messagesWithoutContactName.length} messages without contact names:`
    );
    messagesWithoutContactName.forEach((msg) => {
      const fallbackName = msg.from.split("@")[0];
      console.log(`   - ${fallbackName} (${msg.from}) - will use phone number`);
    });

    // Test 4: Group by contact
    console.log("\n4. Testing contact grouping...");
    const contactGroups = await ChatMessage.findAll({
      attributes: [
        "from",
        "contactName",
        [
          require("sequelize").fn("COUNT", require("sequelize").col("id")),
          "messageCount",
        ],
      ],
      group: ["from", "contactName"],
      order: [
        [
          require("sequelize").fn("COUNT", require("sequelize").col("id")),
          "DESC",
        ],
      ],
      limit: 10,
      raw: true,
    });

    console.log("✅ Contact groups (top 10 by message count):");
    contactGroups.forEach((group) => {
      const displayName = group.contactName || group.from.split("@")[0];
      console.log(`   - ${displayName}: ${group.messageCount} messages`);
    });

    console.log("\n🎉 Contact Name Feature test completed!");
  } catch (error) {
    console.error("❌ Test failed:", error);
  }
}

testContactNameFeature();
