'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add organizationId column to users table
    await queryInterface.addColumn('users', 'organizationId', {
      type: Sequelize.UUID,
      allowNull: true, // Make nullable initially for existing data
      references: {
        model: 'organizations',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    // Add roleInOrg column for SaaS multi-tenant role management
    await queryInterface.addColumn('users', 'roleInOrg', {
      type: Sequelize.ENUM('owner', 'admin', 'member', 'guest'),
      defaultValue: 'member',
      comment: 'Role of user within their organization',
    });

    // Add index on organizationId for better query performance
    await queryInterface.addIndex('users', ['organizationId'], {
      name: 'idx_users_organization_id',
    });

    // Add composite index for organization + role queries
    await queryInterface.addIndex('users', ['organizationId', 'roleInOrg'], {
      name: 'idx_users_org_role',
    });
  },

  async down(queryInterface, Sequelize) {
    // Remove indexes first
    await queryInterface.removeIndex('users', 'idx_users_organization_id');
    await queryInterface.removeIndex('users', 'idx_users_org_role');

    // Remove columns
    await queryInterface.removeColumn('users', 'roleInOrg');
    await queryInterface.removeColumn('users', 'organizationId');

    // Drop ENUM type (only works in PostgreSQL)
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_users_roleInOrg";'
    );
  }
};
