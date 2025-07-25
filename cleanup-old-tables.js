#!/usr/bin/env node

require("dotenv").config();
const sequelize = require("./models/db");

async function cleanupOldTables() {
  console.log("🧹 Cleaning up old duplicate tables...\n");

  try {
    await sequelize.authenticate();
    console.log("✅ Database connected");

    // Old tables to remove (plural versions that were created by Sequelize auto-pluralization)
    const oldTables = [
      "Users",
      "Sessions",
      "Blasts",
      "MessageStatuses",
      "BlacklistedTokens",
      "ChatMessages",
      "MenuItems",
      "Templates",
    ];

    console.log("📋 Checking for old tables to cleanup...");

    // Get all existing tables
    const [results] = await sequelize.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    const existingTables = results.map((row) => row.table_name);
    console.log("📊 Current tables:", existingTables);

    console.log("\n🗑️ Removing old duplicate tables...");

    for (const tableName of oldTables) {
      if (existingTables.includes(tableName)) {
        console.log(`\n🗑️ Dropping table: ${tableName}`);

        try {
          await sequelize.query(`DROP TABLE IF EXISTS "${tableName}" CASCADE;`);
          console.log(`   ✅ Successfully dropped ${tableName}`);
        } catch (error) {
          console.error(`   ❌ Error dropping ${tableName}: ${error.message}`);
        }
      } else {
        console.log(`   ⚠️ Table '${tableName}' not found, skipping...`);
      }
    }

    console.log("\n📊 Final clean table list:");
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

    console.log("\n🎉 Table cleanup completed!");
    console.log("✅ All tables now use proper plural naming convention");
  } catch (error) {
    console.error("❌ Cleanup error:", error.message);
    console.error("Stack:", error.stack);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

cleanupOldTables();
