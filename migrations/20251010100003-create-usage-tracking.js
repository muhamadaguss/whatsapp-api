'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('usage_tracking', {
      id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true,
      },
      organizationId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'organizations',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      metricType: {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: 'e.g., messages_sent, campaigns_created, templates_created, storage_used, etc.',
      },
      value: {
        type: Sequelize.BIGINT,
        defaultValue: 0,
        comment: 'Current usage count for the metric',
      },
      period: {
        type: Sequelize.STRING(20),
        allowNull: false,
        comment: 'Time period format: YYYY-MM for monthly tracking',
      },
      metadata: {
        type: Sequelize.JSON,
        defaultValue: {},
        comment: 'Additional context like WhatsApp account ID, campaign ID, etc.',
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });

    // Add indexes
    await queryInterface.addIndex('usage_tracking', ['organizationId'], {
      name: 'idx_usage_tracking_organization_id',
    });
    await queryInterface.addIndex('usage_tracking', ['metricType'], {
      name: 'idx_usage_tracking_metric_type',
    });
    await queryInterface.addIndex('usage_tracking', ['period'], {
      name: 'idx_usage_tracking_period',
    });
    await queryInterface.addIndex('usage_tracking', ['organizationId', 'metricType', 'period'], {
      name: 'idx_usage_tracking_org_metric_period',
      unique: true,
    });
    await queryInterface.addIndex('usage_tracking', ['organizationId', 'period'], {
      name: 'idx_usage_tracking_org_period',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('usage_tracking');
  }
};
