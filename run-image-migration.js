const sequelize = require("./models/db");
const migration = require("./migrations/add-message-type-and-media-url");

async function runMigration() {
  try {
    console.log(
      "🔄 Running migration to add messageType and mediaUrl columns..."
    );

    await migration.up(sequelize.getQueryInterface(), sequelize);

    console.log("✅ Migration completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

runMigration();
