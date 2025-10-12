'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add created_at column with default value for existing rows
    await queryInterface.addColumn('users', 'created_at', {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      comment: 'Timestamp when user was created'
    });

    // Add updated_at column with default value for existing rows
    await queryInterface.addColumn('users', 'updated_at', {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      comment: 'Timestamp when user was last updated'
    });

    console.log('✅ Added timestamp columns to users table');
    console.log('   - created_at: tracks user creation time');
    console.log('   - updated_at: tracks last modification time');
    console.log('   - Existing rows have been set to CURRENT_TIMESTAMP');
  },

  async down(queryInterface, Sequelize) {
    // Remove timestamp columns
    await queryInterface.removeColumn('users', 'updated_at');
    await queryInterface.removeColumn('users', 'created_at');
    
    console.log('✅ Removed timestamp columns from users table');
  }
};
