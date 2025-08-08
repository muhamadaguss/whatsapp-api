const ChatMessage = require("./models/chatModel");
const { Op } = require("sequelize");

async function updateExistingContacts() {
  try {
    console.log("🔄 Updating existing chat messages with contact names...");

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

    console.log(`Found ${uniqueContacts.length} unique contacts to update`);

    for (const contact of uniqueContacts) {
      const jid = contact.from;

      // Extract phone number from JID as fallback name
      let contactName = jid;
      if (jid.includes("@")) {
        contactName = jid.split("@")[0];
      }

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

      console.log(
        `✅ Updated ${updateResult[0]} messages for contact: ${contactName} (${jid})`
      );
    }

    console.log("🎉 All existing contacts updated successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error updating existing contacts:", error);
    process.exit(1);
  }
}

updateExistingContacts();
