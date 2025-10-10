'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('organizations', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      slug: {
        type: Sequelize.STRING(100),
        allowNull: false,
        unique: true,
      },
      email: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true,
      },
      phone: {
        type: Sequelize.STRING(50),
      },
      ownerId: {
        type: Sequelize.INTEGER,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      subscriptionPlan: {
        type: Sequelize.ENUM('free', 'starter', 'pro', 'enterprise'),
        defaultValue: 'free',
      },
      subscriptionStatus: {
        type: Sequelize.ENUM('active', 'suspended', 'cancelled', 'trial'),
        defaultValue: 'trial',
      },
      trialEndsAt: {
        type: Sequelize.DATE,
      },
      subscriptionStartsAt: {
        type: Sequelize.DATE,
      },
      subscriptionEndsAt: {
        type: Sequelize.DATE,
      },
      settings: {
        type: Sequelize.JSON,
        defaultValue: {},
      },
      timezone: {
        type: Sequelize.STRING(100),
        defaultValue: 'Asia/Jakarta',
      },
      currency: {
        type: Sequelize.STRING(10),
        defaultValue: 'IDR',
      },
      isActive: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      },
      suspendedReason: {
        type: Sequelize.TEXT,
      },
      suspendedAt: {
        type: Sequelize.DATE,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      deletedAt: {
        type: Sequelize.DATE,
      },
    });

    // Add indexes
    await queryInterface.addIndex('organizations', ['slug'], {
      name: 'idx_organizations_slug',
    });
    await queryInterface.addIndex('organizations', ['email'], {
      name: 'idx_organizations_email',
    });
    await queryInterface.addIndex('organizations', ['ownerId'], {
      name: 'idx_organizations_owner_id',
    });
    await queryInterface.addIndex('organizations', ['subscriptionPlan'], {
      name: 'idx_organizations_subscription_plan',
    });
    await queryInterface.addIndex('organizations', ['subscriptionStatus'], {
      name: 'idx_organizations_subscription_status',
    });
    await queryInterface.addIndex('organizations', ['isActive'], {
      name: 'idx_organizations_is_active',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('organizations');
  }
};
