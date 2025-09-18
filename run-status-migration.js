require('dotenv').config();
const sequelize = require('./models/db');
const path = require('path');
const fs = require('fs');
const logger = require('./utils/logger');

async function runStatusTrackingMigration() {
  try {
    logger.info('🔄 Starting session status tracking migration...');

    // Import the migration
    const migration = require('./20241228_add_session_status_tracking.js');
    
    // Run the up migration
    await migration.up(sequelize.getQueryInterface(), sequelize.Sequelize);
    
    logger.info('✅ Session status tracking migration completed successfully');
    
    // Test the new columns by describing the Sessions table
    const tableDescription = await sequelize.getQueryInterface().describeTable('Sessions');
    
    const newColumns = [
      'healthScore', 'connectionQuality', 'lastStatusCheck', 
      'lastHeartbeat', 'statusMetadata', 'isBlocked', 
      'blockedAt', 'lastError', 'errorCount'
    ];
    
    logger.info('📋 Verifying new columns:');
    newColumns.forEach(column => {
      if (tableDescription[column]) {
        logger.info(`  ✅ ${column}: ${tableDescription[column].type}`);
      } else {
        logger.error(`  ❌ ${column}: Missing!`);
      }
    });

    return true;

  } catch (error) {
    logger.error('❌ Migration failed:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  runStatusTrackingMigration()
    .then(() => {
      logger.info('✅ Migration script completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('💥 Migration script failed:', error);
      process.exit(1);
    });
}

module.exports = { runStatusTrackingMigration };