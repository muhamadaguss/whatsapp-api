'use strict';

/**
 * Migration: Add Super Admin Support
 * 
 * Adds isSuperAdmin field to users table to support platform administrators
 * who can access all organizations without tenant isolation.
 * 
 * Super Admin features:
 * - Can view all organizations
 * - Can manage any organization
 * - Can access any user data
 * - Bypasses tenant isolation middleware
 * - Cannot be restricted by quota limits
 * - organizationId can be NULL for super admins
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if columns already exist (in case of partial migration)
    const tableInfo = await queryInterface.describeTable('users');
    
    // Add isSuperAdmin column if it doesn't exist
    if (!tableInfo.isSuperAdmin) {
      await queryInterface.addColumn('users', 'isSuperAdmin', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Platform super administrator flag - bypasses tenant isolation'
      });
      console.log('✅ Added isSuperAdmin column');
    }

    // Add index for super admin queries (check if exists first)
    const indexes = await queryInterface.showIndex('users');
    const indexExists = indexes.some(idx => idx.name === 'idx_users_is_super_admin');
    
    if (!indexExists) {
      await queryInterface.addIndex('users', ['isSuperAdmin'], {
        name: 'idx_users_is_super_admin',
        where: {
          isSuperAdmin: true
        }
      });
      console.log('✅ Added super admin index');
    }

    // Add lastAdminAccessAt for tracking super admin activities
    if (!tableInfo.lastAdminAccessAt) {
      await queryInterface.addColumn('users', 'lastAdminAccessAt', {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Last time super admin accessed platform admin features'
      });
      console.log('✅ Added lastAdminAccessAt column');
    }

    console.log('✅ Super Admin support added to users table');
    console.log('📝 To create a super admin user, run:');
    console.log('   UPDATE users SET "isSuperAdmin" = true WHERE username = \'your_admin_username\';');
  },

  async down(queryInterface, Sequelize) {
    // Remove lastAdminAccessAt column
    await queryInterface.removeColumn('users', 'lastAdminAccessAt');

    // Remove super admin index
    await queryInterface.removeIndex('users', 'idx_users_is_super_admin');
    
    // Remove isSuperAdmin column
    await queryInterface.removeColumn('users', 'isSuperAdmin');

    console.log('✅ Super Admin support removed from users table');
  }
};
