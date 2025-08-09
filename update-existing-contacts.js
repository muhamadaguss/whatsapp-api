const ChatMessage = require("./models/chatModel");
const sequelize = require("./models/db");
const { Op } = require("sequelize");

async function checkDatabaseConnection() {
  try {
    await sequelize.authenticate();
    console.log("✅ Database connection established successfully.");
    return true;
  } catch (error) {
    console.error("❌ Unable to connect to the database:");
    console.error("Error:", error.message);
    console.error("\n🔧 Troubleshooting steps:");
    console.error("1. Make sure PostgreSQL is running");
    console.error("2. Check database credentials in .env file");
    console.error("3. Verify database host is accessible");
    console.error("4. Check if database exists");
    return false;
  }
}

async function updateExistingContacts() {
  try {
    console.log("🔄 Starting contact name update process...\n");

    // Check database connection first
    const isConnected = await checkDatabaseConnection();
    if (!isConnected) {
      console.error("\n❌ Cannot proceed without database connection.");
      process.exit(1);
    }

    console.log("\n📊 Analyzing existing chat messages...");

    // Get all unique contacts (JIDs) from existing messages
    const uniqueContacts = await ChatMessage.findAll({
      attributes: ["from"],
      where: {
        contactName: {
          [Op.or]: [null, ""],
        },
      },
      group: ["from"],
      raw: true,
    });

    if (uniqueContacts.length === 0) {
      console.log(
        "ℹ️ No contacts need updating. All messages already have contact names."
      );
      process.exit(0);
    }

    console.log(
      `📋 Found ${uniqueContacts.length} unique contacts to update\n`
    );

    let updatedCount = 0;
    let totalMessages = 0;

    for (const contact of uniqueContacts) {
      const jid = contact.from;

      // Extract phone number from JID as fallback name
      let contactName = jid;
      if (jid.includes("@")) {
        contactName = jid.split("@")[0];
      }

      try {
        // Update all messages from this contact
        const updateResult = await ChatMessage.update(
          { contactName: contactName },
          {
            where: {
              from: jid,
              contactName: {
                [Op.or]: [null, ""],
              },
            },
          }
        );

        const messagesUpdated = updateResult[0];
        updatedCount++;
        totalMessages += messagesUpdated;

        console.log(
          `✅ Updated ${messagesUpdated} messages for: ${contactName} (${jid})`
        );
      } catch (updateError) {
        console.error(
          `❌ Failed to update contact ${jid}:`,
          updateError.message
        );
      }
    }

    console.log(`\n🎉 Update completed successfully!`);
    console.log(`📈 Summary:`);
    console.log(
      `   - Contacts updated: ${updatedCount}/${uniqueContacts.length}`
    );
    console.log(`   - Total messages updated: ${totalMessages}`);

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Error updating existing contacts:", error.message);
    console.error("\n🔧 Please check:");
    console.error("1. Database connection");
    console.error("2. Table structure (run migrations first)");
    console.error("3. Database permissions");
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\n⚠️ Process interrupted by user");
  process.exit(1);
});

process.on("SIGTERM", () => {
  console.log("\n⚠️ Process terminated");
  process.exit(1);
});

updateExistingContacts();
