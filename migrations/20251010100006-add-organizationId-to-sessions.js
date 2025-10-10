'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add organizationId column to sessions table
    await queryInterface.addColumn('sessions', 'organizationId', {
      type: Sequelize.UUID,
      allowNull: true, // Make nullable initially for existing data
      references: {
        model: 'organizations',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
      comment: 'Links WhatsApp session to organization for multi-tenant isolation',
    });

    // Add index on organizationId
    await queryInterface.addIndex('sessions', ['organizationId'], {
      name: 'idx_sessions_organization_id',
    });

    // Add composite index for organization + status queries
    await queryInterface.addIndex('sessions', ['organizationId', 'status'], {
      name: 'idx_sessions_org_status',
    });
  },

  async down(queryInterface, Sequelize) {
    // Remove indexes first
    await queryInterface.removeIndex('sessions', 'idx_sessions_organization_id');
    await queryInterface.removeIndex('sessions', 'idx_sessions_org_status');

    // Remove column
    await queryInterface.removeColumn('sessions', 'organizationId');
  }
};
