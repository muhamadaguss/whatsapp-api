/**
 * Migration Runner for WhatsApp Session Enhancement
 * Run this script to apply database migrations
 */

const fs = require('fs');
const path = require('path');
const sequelize = require('../models/db');
const logger = require('../utils/logger');

async function runMigration() {
  try {
    console.log('🚀 Starting WhatsApp Session Enhancement Migration...');

    // Read migration SQL file
    const migrationPath = path.join(__dirname, '../migrations/add-whatsapp-session-fields.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    // Split SQL commands (handle multiple statements)
    const commands = migrationSQL.split(';').filter(cmd => cmd.trim().length > 0);

    // Execute each command
    for (let i = 0; i < commands.length; i++) {
      const command = commands[i].trim();
      if (command) {
        console.log(`📝 Executing command ${i + 1}/${commands.length}...`);
        await sequelize.query(command);
      }
    }

    console.log('✅ Migration completed successfully!');
    
    // Test the new schema
    await testMigration();
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

async function testMigration() {
  try {
    console.log('🧪 Testing migration...');
    
    // Test that we can query the new fields
    const [results] = await sequelize.query(`
      SELECT 
        session_id,
        phone_number,
        display_name,
        connection_quality,
        metadata
      FROM sessions 
      LIMIT 1
    `);
    
    console.log('✅ Migration test passed - new fields are accessible');
    return true;
  } catch (error) {
    console.error('❌ Migration test failed:', error);
    throw error;
  }
}

async function rollbackMigration() {
  try {
    console.log('🔄 Rolling back WhatsApp Session Enhancement Migration...');

    const rollbackSQL = `
      -- Remove added columns
      ALTER TABLE sessions 
      DROP COLUMN IF EXISTS display_name,
      DROP COLUMN IF EXISTS profile_picture,
      DROP COLUMN IF EXISTS last_seen,
      DROP COLUMN IF EXISTS connection_quality,
      DROP COLUMN IF EXISTS metadata;

      -- Drop enum type
      DROP TYPE IF EXISTS connection_quality_enum;

      -- Remove indexes
      DROP INDEX IF EXISTS idx_sessions_status;
      DROP INDEX IF EXISTS idx_sessions_user_id;
      DROP INDEX IF EXISTS idx_sessions_phone_number;
      DROP INDEX IF EXISTS idx_blast_sessions_whatsapp_session_id;
    `;

    await sequelize.query(rollbackSQL);
    console.log('✅ Migration rollback completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration rollback failed:', error);
    throw error;
  }
}

// CLI execution
if (require.main === module) {
  const action = process.argv[2];
  
  if (action === 'rollback') {
    rollbackMigration()
      .then(() => process.exit(0))
      .catch(err => {
        console.error(err);
        process.exit(1);
      });
  } else {
    runMigration()
      .then(() => process.exit(0))
      .catch(err => {
        console.error(err);
        process.exit(1);
      });
  }
}

module.exports = {
  runMigration,
  rollbackMigration,
  testMigration
};
