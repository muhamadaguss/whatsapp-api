const { Sequelize, DataTypes } = require('sequelize');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    try {
      // Add new columns to Sessions table for status tracking
      await queryInterface.addColumn('Sessions', 'healthScore', {
        type: DataTypes.INTEGER,
        defaultValue: 100,
        allowNull: false,
        comment: 'Health score from 0-100 based on connection quality'
      });

      await queryInterface.addColumn('Sessions', 'connectionQuality', {
        type: DataTypes.ENUM('excellent', 'good', 'fair', 'poor', 'unknown'),
        defaultValue: 'unknown',
        allowNull: false,
        comment: 'Connection quality assessment'
      });

      await queryInterface.addColumn('Sessions', 'lastStatusCheck', {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Last time status was checked'
      });

      await queryInterface.addColumn('Sessions', 'lastHeartbeat', {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Last heartbeat/ping response time'
      });

      await queryInterface.addColumn('Sessions', 'statusMetadata', {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'Additional status metadata and history'
      });

      await queryInterface.addColumn('Sessions', 'isBlocked', {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        allowNull: false,
        comment: 'Whether account is blocked/restricted'
      });

      await queryInterface.addColumn('Sessions', 'blockedAt', {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'When account was blocked'
      });

      await queryInterface.addColumn('Sessions', 'lastError', {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Last error message encountered'
      });

      await queryInterface.addColumn('Sessions', 'errorCount', {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        allowNull: false,
        comment: 'Count of consecutive errors'
      });

      // Add indexes for better query performance
      await queryInterface.addIndex('Sessions', ['status', 'isBlocked'], {
        name: 'idx_sessions_status_blocked'
      });

      await queryInterface.addIndex('Sessions', ['connectionQuality', 'healthScore'], {
        name: 'idx_sessions_quality_health'
      });

      await queryInterface.addIndex('Sessions', ['lastStatusCheck'], {
        name: 'idx_sessions_last_status_check'
      });

      console.log('✅ Session status tracking columns added successfully');

    } catch (error) {
      console.error('❌ Error adding status tracking columns:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    try {
      // Remove indexes first
      await queryInterface.removeIndex('Sessions', 'idx_sessions_status_blocked');
      await queryInterface.removeIndex('Sessions', 'idx_sessions_quality_health');
      await queryInterface.removeIndex('Sessions', 'idx_sessions_last_status_check');

      // Remove columns
      await queryInterface.removeColumn('Sessions', 'healthScore');
      await queryInterface.removeColumn('Sessions', 'connectionQuality');
      await queryInterface.removeColumn('Sessions', 'lastStatusCheck');
      await queryInterface.removeColumn('Sessions', 'lastHeartbeat');
      await queryInterface.removeColumn('Sessions', 'statusMetadata');
      await queryInterface.removeColumn('Sessions', 'isBlocked');
      await queryInterface.removeColumn('Sessions', 'blockedAt');
      await queryInterface.removeColumn('Sessions', 'lastError');
      await queryInterface.removeColumn('Sessions', 'errorCount');

      console.log('✅ Session status tracking columns removed successfully');

    } catch (error) {
      console.error('❌ Error removing status tracking columns:', error);
      throw error;
    }
  }
};