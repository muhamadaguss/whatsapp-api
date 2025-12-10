/**
 * Verify auto-reply setup
 * Check if tables exist and rules are seeded
 *
 * Usage: node whatsapp/scripts/verifyAutoReplySetup.js
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const sequelize = require("../models/db");
const AutoReplyRule = require("../models/autoReplyRuleModel");
const AutoReplyLog = require("../models/autoReplyLogModel");
const logger = require("../utils/logger");

async function verify() {
  try {
    logger.info("🔍 Starting verification...");

    // Connect to database
    await sequelize.authenticate();
    logger.info("✅ Database connected");

    // Check if tables exist
    const [tables] = await sequelize.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE 'auto_reply%'
      ORDER BY table_name;
    `);

    logger.info(`📋 Found ${tables.length} auto_reply tables:`);
    tables.forEach((table) => {
      logger.info(`   - ${table.table_name}`);
    });

    // Check rules count
    const rulesCount = await AutoReplyRule.count();
    logger.info(`📊 Total auto-reply rules: ${rulesCount}`);

    if (rulesCount === 0) {
      logger.warn("⚠️  No rules found! Run seeder to create default rules.");
    } else {
      // Show all rules
      const rules = await AutoReplyRule.findAll({
        attributes: ["id", "category", "isActive"],
        order: [["category", "ASC"]],
      });

      logger.info("📝 Auto-reply rules:");
      rules.forEach((rule) => {
        const status = rule.isActive ? "✅" : "❌";
        logger.info(`   ${status} ${rule.category} (ID: ${rule.id})`);
      });
    }

    // Check logs count
    const logsCount = await AutoReplyLog.count();
    logger.info(`📊 Total auto-reply logs: ${logsCount}`);

    // Summary
    logger.info("\n🎉 Verification Summary:");
    logger.info(`   Tables: ${tables.length}/2 ✅`);
    logger.info(`   Rules: ${rulesCount}/5 ${rulesCount === 5 ? "✅" : "⚠️"}`);
    logger.info(`   Logs: ${logsCount} 📝`);

    if (tables.length === 2 && rulesCount === 5) {
      logger.info("\n✅ Auto-reply setup is complete and ready to use!");
    } else {
      logger.warn("\n⚠️  Setup incomplete. Please check the logs above.");
    }

    process.exit(0);
  } catch (error) {
    logger.error("❌ Verification failed:", error);
    process.exit(1);
  }
}

verify();
