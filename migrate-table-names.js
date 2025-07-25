#!/usr/bin/env node

require("dotenv").config();
const sequelize = require("./models/db");

async function migrateTableNames() {
  console.log("🔄 Migrating table names from singular to plural...\n");

  try {
    await sequelize.authenticate();
    console.log("✅ Database connected");

    // Table mappings: old_name -> new_name
    const tableMappings = {
      User: "users",
      Session: "sessions",
      Blast: "blasts",
      MessageStatus: "message_statuses",
      BlacklistedToken: "blacklisted_tokens",
      ChatMessage: "chat_messages",
      MenuItem: "menu_items",
      Template: "templates",
    };

    console.log("📋 Checking existing tables...");

    // Get all existing tables
    const [results] = await sequelize.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    const existingTables = results.map((row) => row.table_name);
    console.log("📊 Existing tables:", existingTables);

    console.log("\n🔄 Processing table migrations...");

    for (const [oldName, newName] of Object.entries(tableMappings)) {
      if (existingTables.includes(oldName)) {
        console.log(`\n📝 Migrating: ${oldName} -> ${newName}`);

        try {
          // Check if new table already exists
          if (existingTables.includes(newName)) {
            console.log(`   ⚠️ Table '${newName}' already exists, skipping...`);
            continue;
          }

          // Rename table
          await sequelize.query(
            `ALTER TABLE "${oldName}" RENAME TO "${newName}";`
          );
          console.log(`   ✅ Successfully renamed ${oldName} to ${newName}`);

          // Update enum types if needed
          if (oldName === "User") {
            try {
              await sequelize.query(
                `ALTER TYPE "enum_User_role" RENAME TO "enum_users_role";`
              );
              console.log(`   ✅ Renamed enum type for users table`);
            } catch (enumError) {
              console.log(`   ⚠️ Enum rename skipped: ${enumError.message}`);
            }
          }
        } catch (error) {
          console.error(`   ❌ Error migrating ${oldName}: ${error.message}`);
        }
      } else {
        console.log(`   ⚠️ Table '${oldName}' not found, skipping...`);
      }
    }

    console.log("\n📊 Final table list:");
    const [finalResults] = await sequelize.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    finalResults.forEach((row) => {
      console.log(`   📋 ${row.table_name}`);
    });

    console.log("\n🎉 Table migration completed!");
  } catch (error) {
    console.error("❌ Migration error:", error.message);
    console.error("Stack:", error.stack);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

migrateTableNames();
