'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add organizationId column to templates table
    await queryInterface.addColumn('templates', 'organizationId', {
      type: Sequelize.UUID,
      allowNull: true, // Make nullable initially for existing data
      references: {
        model: 'organizations',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
      comment: 'Links template to organization for quota enforcement',
    });

    // Add index on organizationId
    await queryInterface.addIndex('templates', ['organizationId'], {
      name: 'idx_templates_organization_id',
    });

    // Add composite index for organization + userId queries
    await queryInterface.addIndex('templates', ['organizationId', 'userId'], {
      name: 'idx_templates_org_user',
    });
  },

  async down(queryInterface, Sequelize) {
    // Remove indexes first
    await queryInterface.removeIndex('templates', 'idx_templates_organization_id');
    await queryInterface.removeIndex('templates', 'idx_templates_org_user');

    // Remove column
    await queryInterface.removeColumn('templates', 'organizationId');
  }
};
