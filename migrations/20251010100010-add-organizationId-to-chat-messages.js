'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add organizationId column to chat_messages table
    await queryInterface.addColumn('chat_messages', 'organizationId', {
      type: Sequelize.UUID,
      allowNull: true, // Make nullable initially for existing data
      references: {
        model: 'organizations',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
      comment: 'Links chat message to organization for data isolation',
    });

    // Add index on organizationId
    await queryInterface.addIndex('chat_messages', ['organizationId'], {
      name: 'idx_chat_messages_organization_id',
    });

    // Add composite index for organization + sessionId queries
    await queryInterface.addIndex('chat_messages', ['organizationId', 'sessionId'], {
      name: 'idx_chat_messages_org_session',
    });
  },

  async down(queryInterface, Sequelize) {
    // Remove indexes first
    await queryInterface.removeIndex('chat_messages', 'idx_chat_messages_organization_id');
    await queryInterface.removeIndex('chat_messages', 'idx_chat_messages_org_session');

    // Remove column
    await queryInterface.removeColumn('chat_messages', 'organizationId');
  }
};
