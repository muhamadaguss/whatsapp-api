const sequelize = require("./models/db");
const isReadMigration = require("./migrations/add-isread-to-chat-messages");
const contactNameMigration = require("./migrations/add-contactname-to-chat-messages");

async function runMigrations() {
  try {
    console.log("Running migration: add isRead column to chat_messages...");
    await isReadMigration.up(sequelize.getQueryInterface(), sequelize);
    console.log("✅ isRead migration completed!");

    console.log(
      "Running migration: add contactName column to chat_messages..."
    );
    await contactNameMigration.up(sequelize.getQueryInterface(), sequelize);
    console.log("✅ contactName migration completed!");

    console.log("🎉 All migrations completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

runMigrations();
