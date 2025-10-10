'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add organizationId column to blast_sessions table
    await queryInterface.addColumn('blast_sessions', 'organization_id', {
      type: Sequelize.UUID,
      allowNull: true, // Make nullable initially for existing data
      references: {
        model: 'organizations',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
      comment: 'Links blast session to organization for quota tracking',
    });

    // Add index on organization_id
    await queryInterface.addIndex('blast_sessions', ['organization_id'], {
      name: 'idx_blast_sessions_organization_id',
    });

    // Add composite index for organization + status queries
    await queryInterface.addIndex('blast_sessions', ['organization_id', 'status'], {
      name: 'idx_blast_sessions_org_status',
    });
  },

  async down(queryInterface, Sequelize) {
    // Remove indexes first
    await queryInterface.removeIndex('blast_sessions', 'idx_blast_sessions_organization_id');
    await queryInterface.removeIndex('blast_sessions', 'idx_blast_sessions_org_status');

    // Remove column
    await queryInterface.removeColumn('blast_sessions', 'organization_id');
  }
};
