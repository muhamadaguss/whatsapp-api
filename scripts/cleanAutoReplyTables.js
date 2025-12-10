/**
 * Script to clean auto_reply tables if they exist
 * Run this if you encounter sync errors
 *
 * Usage: node whatsapp/scripts/cleanAutoReplyTables.js
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const sequelize = require("../models/db");
const logger = require("../utils/logger");

async function cleanTables() {
  try {
    logger.info("🧹 Starting table cleanup...");

    // Connect to database
    await sequelize.authenticate();
    logger.info("✅ Database connected");

    // Drop tables if exist (in correct order due to foreign keys)
    await sequelize.query('DROP TABLE IF EXISTS "auto_reply_logs" CASCADE;');
    logger.info("✅ Dropped auto_reply_logs table");

    await sequelize.query('DROP TABLE IF EXISTS "auto_reply_rules" CASCADE;');
    logger.info("✅ Dropped auto_reply_rules table");

    logger.info("🎉 Cleanup completed successfully!");
    logger.info("💡 Now you can restart the application to recreate tables");

    process.exit(0);
  } catch (error) {
    logger.error("❌ Cleanup failed:", error);
    process.exit(1);
  }
}

cleanTables();
