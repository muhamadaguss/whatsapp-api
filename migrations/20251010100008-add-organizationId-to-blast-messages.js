'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add organizationId column to blast_messages table
    await queryInterface.addColumn('blast_messages', 'organization_id', {
      type: Sequelize.UUID,
      allowNull: true, // Make nullable initially for existing data
      references: {
        model: 'organizations',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
      comment: 'Links blast message to organization for quota tracking and reporting',
    });

    // Add index on organization_id
    await queryInterface.addIndex('blast_messages', ['organization_id'], {
      name: 'idx_blast_messages_organization_id',
    });

    // Add composite index for organization + status queries (for analytics)
    await queryInterface.addIndex('blast_messages', ['organization_id', 'status'], {
      name: 'idx_blast_messages_org_status',
    });
  },

  async down(queryInterface, Sequelize) {
    // Remove indexes first
    await queryInterface.removeIndex('blast_messages', 'idx_blast_messages_organization_id');
    await queryInterface.removeIndex('blast_messages', 'idx_blast_messages_org_status');

    // Remove column
    await queryInterface.removeColumn('blast_messages', 'organization_id');
  }
};
