require('dotenv').config();
const { QueryInterface, Sequelize } = require('sequelize');
const sequelize = require('./models/db');
const logger = require('./utils/logger');

async function runStatusTrackingMigration() {
  try {
    logger.info('🔄 Starting session status tracking migration...');

    const queryInterface = sequelize.getQueryInterface();

    // Add columns one by one with better error handling
    const columnsToAdd = [
      {
        name: 'healthScore',
        definition: {
          type: Sequelize.INTEGER,
          defaultValue: 100,
          allowNull: false
        }
      },
      {
        name: 'connectionQuality',
        definition: {
          type: Sequelize.ENUM('excellent', 'good', 'fair', 'poor', 'unknown'),
          defaultValue: 'unknown',
          allowNull: false
        }
      },
      {
        name: 'lastStatusCheck',
        definition: {
          type: Sequelize.DATE,
          allowNull: true
        }
      },
      {
        name: 'lastHeartbeat',
        definition: {
          type: Sequelize.DATE,
          allowNull: true
        }
      },
      {
        name: 'statusMetadata',
        definition: {
          type: Sequelize.JSONB,
          allowNull: true,
          defaultValue: {}
        }
      },
      {
        name: 'isBlocked',
        definition: {
          type: Sequelize.BOOLEAN,
          defaultValue: false,
          allowNull: false
        }
      },
      {
        name: 'blockedAt',
        definition: {
          type: Sequelize.DATE,
          allowNull: true
        }
      },
      {
        name: 'lastError',
        definition: {
          type: Sequelize.TEXT,
          allowNull: true
        }
      },
      {
        name: 'errorCount',
        definition: {
          type: Sequelize.INTEGER,
          defaultValue: 0,
          allowNull: false
        }
      }
    ];

    // Check existing columns first
    const tableDescription = await queryInterface.describeTable('Sessions');
    
    // Add columns that don't exist
    for (const column of columnsToAdd) {
      if (!tableDescription[column.name]) {
        try {
          await queryInterface.addColumn('Sessions', column.name, column.definition);
          logger.info(`  ✅ Added column: ${column.name}`);
        } catch (error) {
          logger.error(`  ❌ Failed to add ${column.name}:`, error.message);
        }
      } else {
        logger.info(`  ⚠️  Column ${column.name} already exists, skipping`);
      }
    }

    // Add indexes
    const indexesToAdd = [
      {
        name: 'idx_sessions_status_blocked',
        fields: ['status', 'isBlocked']
      },
      {
        name: 'idx_sessions_quality_health', 
        fields: ['connectionQuality', 'healthScore']
      },
      {
        name: 'idx_sessions_last_status_check',
        fields: ['lastStatusCheck']
      }
    ];

    for (const index of indexesToAdd) {
      try {
        await queryInterface.addIndex('Sessions', index.fields, {
          name: index.name
        });
        logger.info(`  ✅ Added index: ${index.name}`);
      } catch (error) {
        if (error.message.includes('already exists')) {
          logger.info(`  ⚠️  Index ${index.name} already exists, skipping`);
        } else {
          logger.error(`  ❌ Failed to add index ${index.name}:`, error.message);
        }
      }
    }

    logger.info('✅ Session status tracking migration completed successfully');
    
    // Verify all columns exist
    const updatedDescription = await queryInterface.describeTable('Sessions');
    const newColumns = columnsToAdd.map(c => c.name);
    
    logger.info('📋 Verifying new columns:');
    newColumns.forEach(column => {
      if (updatedDescription[column]) {
        logger.info(`  ✅ ${column}: ${updatedDescription[column].type}`);
      } else {
        logger.error(`  ❌ ${column}: Missing!`);
      }
    });

    return true;

  } catch (error) {
    logger.error('❌ Migration failed:', error.message);
    logger.error('❌ Error stack:', error.stack);
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
      logger.error('💥 Migration script failed:', error.message);
      process.exit(1);
    });
}

module.exports = { runStatusTrackingMigration };