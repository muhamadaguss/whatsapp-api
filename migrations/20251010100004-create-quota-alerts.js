'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('quota_alerts', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
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
        comment: 'Type of quota: messages_sent, storage_used, campaigns_created, etc.',
      },
      currentUsage: {
        type: Sequelize.BIGINT,
        allowNull: false,
      },
      quotaLimit: {
        type: Sequelize.BIGINT,
        allowNull: false,
      },
      usagePercentage: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
        comment: 'Percentage of quota used (0-100)',
      },
      alertLevel: {
        type: Sequelize.ENUM('warning', 'critical', 'exceeded'),
        allowNull: false,
        comment: 'warning: 80%, critical: 95%, exceeded: 100%',
      },
      notificationSent: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      notificationSentAt: {
        type: Sequelize.DATE,
      },
      resolved: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: 'True when usage drops below threshold or quota increased',
      },
      resolvedAt: {
        type: Sequelize.DATE,
      },
      period: {
        type: Sequelize.STRING(20),
        allowNull: false,
        comment: 'Time period format: YYYY-MM for monthly tracking',
      },
      metadata: {
        type: Sequelize.JSON,
        defaultValue: {},
        comment: 'Additional context like notification history, suggested actions, etc.',
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
    await queryInterface.addIndex('quota_alerts', ['organizationId'], {
      name: 'idx_quota_alerts_organization_id',
    });
    await queryInterface.addIndex('quota_alerts', ['metricType'], {
      name: 'idx_quota_alerts_metric_type',
    });
    await queryInterface.addIndex('quota_alerts', ['alertLevel'], {
      name: 'idx_quota_alerts_alert_level',
    });
    await queryInterface.addIndex('quota_alerts', ['resolved'], {
      name: 'idx_quota_alerts_resolved',
    });
    await queryInterface.addIndex('quota_alerts', ['organizationId', 'metricType', 'period'], {
      name: 'idx_quota_alerts_org_metric_period',
    });
    await queryInterface.addIndex('quota_alerts', ['organizationId', 'resolved'], {
      name: 'idx_quota_alerts_org_resolved',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('quota_alerts');
  }
};
