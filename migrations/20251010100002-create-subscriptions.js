'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('subscriptions', {
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
      planId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'subscription_plans',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      status: {
        type: Sequelize.ENUM('active', 'cancelled', 'expired', 'suspended', 'pending'),
        defaultValue: 'pending',
      },
      startDate: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      endDate: {
        type: Sequelize.DATE,
      },
      trialEndsAt: {
        type: Sequelize.DATE,
      },
      cancelledAt: {
        type: Sequelize.DATE,
      },
      billingCycle: {
        type: Sequelize.ENUM('monthly', 'yearly'),
        defaultValue: 'monthly',
      },
      autoRenew: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      },
      amount: {
        type: Sequelize.DECIMAL(10, 2),
        defaultValue: 0,
      },
      currency: {
        type: Sequelize.STRING(10),
        defaultValue: 'IDR',
      },
      metadata: {
        type: Sequelize.JSON,
        defaultValue: {},
        comment: 'Additional subscription data like payment info, upgrade history, etc.',
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
    await queryInterface.addIndex('subscriptions', ['organizationId'], {
      name: 'idx_subscriptions_organization_id',
    });
    await queryInterface.addIndex('subscriptions', ['planId'], {
      name: 'idx_subscriptions_plan_id',
    });
    await queryInterface.addIndex('subscriptions', ['status'], {
      name: 'idx_subscriptions_status',
    });
    await queryInterface.addIndex('subscriptions', ['endDate'], {
      name: 'idx_subscriptions_end_date',
    });
    await queryInterface.addIndex('subscriptions', ['organizationId', 'status'], {
      name: 'idx_subscriptions_org_status',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('subscriptions');
  }
};
