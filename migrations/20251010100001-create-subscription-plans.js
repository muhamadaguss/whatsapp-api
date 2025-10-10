'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('subscription_plans', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      name: {
        type: Sequelize.STRING(100),
        allowNull: false,
        unique: true,
      },
      displayName: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      description: {
        type: Sequelize.TEXT,
      },
      priceMonthly: {
        type: Sequelize.DECIMAL(10, 2),
        defaultValue: 0,
      },
      priceYearly: {
        type: Sequelize.DECIMAL(10, 2),
        defaultValue: 0,
      },
      currency: {
        type: Sequelize.STRING(10),
        defaultValue: 'IDR',
      },
      quotas: {
        type: Sequelize.JSON,
        allowNull: false,
        defaultValue: {
          maxWhatsappAccounts: 1,
          maxMessagesPerMonth: 1000,
          maxCampaignsPerMonth: 10,
          maxContacts: 1000,
          maxTemplates: 5,
          maxUsers: 1,
          maxStorageMb: 100,
          dailyMessageLimit: 100,
          concurrentBlasts: 1,
        },
      },
      features: {
        type: Sequelize.JSON,
        defaultValue: {
          spinText: false,
          advancedAnalytics: false,
          apiAccess: false,
          customBranding: false,
          prioritySupport: false,
          webhookIntegration: false,
          teamCollaboration: false,
          advancedScheduling: false,
        },
      },
      sortOrder: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },
      isVisible: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      },
      isPopular: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
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
    await queryInterface.addIndex('subscription_plans', ['name'], {
      name: 'idx_subscription_plans_name',
      unique: true,
    });
    await queryInterface.addIndex('subscription_plans', ['isVisible'], {
      name: 'idx_subscription_plans_is_visible',
    });
    await queryInterface.addIndex('subscription_plans', ['sortOrder'], {
      name: 'idx_subscription_plans_sort_order',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('subscription_plans');
  }
};
