'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert('subscription_plans', [
      {
        // FREE PLAN
        name: 'free',
        displayName: 'Free Plan',
        description: 'Perfect for trying out the platform with basic features',
        priceMonthly: 0,
        priceYearly: 0,
        currency: 'IDR',
        quotas: JSON.stringify({
          maxWhatsappAccounts: 1,
          maxMessagesPerMonth: 500,
          maxCampaignsPerMonth: 5,
          maxContacts: 500,
          maxTemplates: 3,
          maxUsers: 1,
          maxStorageMb: 50,
          dailyMessageLimit: 50,
          concurrentBlasts: 1,
        }),
        features: JSON.stringify({
          spinText: false,
          advancedAnalytics: false,
          apiAccess: false,
          customBranding: false,
          prioritySupport: false,
          webhookIntegration: false,
          teamCollaboration: false,
          advancedScheduling: false,
        }),
        sortOrder: 1,
        isVisible: true,
        isPopular: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        // STARTER PLAN
        name: 'starter',
        displayName: 'Starter Plan',
        description: 'Great for small businesses getting started with WhatsApp marketing',
        priceMonthly: 200000,
        priceYearly: 2000000, // ~17% discount (10 months price)
        currency: 'IDR',
        quotas: JSON.stringify({
          maxWhatsappAccounts: 2,
          maxMessagesPerMonth: 5000,
          maxCampaignsPerMonth: 20,
          maxContacts: 2000,
          maxTemplates: 10,
          maxUsers: 2,
          maxStorageMb: 200,
          dailyMessageLimit: 500,
          concurrentBlasts: 2,
        }),
        features: JSON.stringify({
          spinText: true,
          advancedAnalytics: false,
          apiAccess: false,
          customBranding: false,
          prioritySupport: false,
          webhookIntegration: false,
          teamCollaboration: true,
          advancedScheduling: true,
        }),
        sortOrder: 2,
        isVisible: true,
        isPopular: true, // Most popular plan
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        // PRO PLAN
        name: 'pro',
        displayName: 'Pro Plan',
        description: 'Advanced features for growing businesses with higher volume needs',
        priceMonthly: 500000,
        priceYearly: 5000000, // ~17% discount
        currency: 'IDR',
        quotas: JSON.stringify({
          maxWhatsappAccounts: 5,
          maxMessagesPerMonth: 20000,
          maxCampaignsPerMonth: 100,
          maxContacts: 10000,
          maxTemplates: 50,
          maxUsers: 5,
          maxStorageMb: 1000,
          dailyMessageLimit: 2000,
          concurrentBlasts: 5,
        }),
        features: JSON.stringify({
          spinText: true,
          advancedAnalytics: true,
          apiAccess: true,
          customBranding: false,
          prioritySupport: true,
          webhookIntegration: true,
          teamCollaboration: true,
          advancedScheduling: true,
        }),
        sortOrder: 3,
        isVisible: true,
        isPopular: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        // ENTERPRISE PLAN
        name: 'enterprise',
        displayName: 'Enterprise Plan',
        description: 'Unlimited resources and premium support for large organizations',
        priceMonthly: 0, // Custom pricing - contact sales
        priceYearly: 0,
        currency: 'IDR',
        quotas: JSON.stringify({
          maxWhatsappAccounts: 999999, // Virtually unlimited
          maxMessagesPerMonth: 999999999,
          maxCampaignsPerMonth: 999999,
          maxContacts: 999999999,
          maxTemplates: 999999,
          maxUsers: 999999,
          maxStorageMb: 999999999,
          dailyMessageLimit: 999999,
          concurrentBlasts: 999999,
        }),
        features: JSON.stringify({
          spinText: true,
          advancedAnalytics: true,
          apiAccess: true,
          customBranding: true,
          prioritySupport: true,
          webhookIntegration: true,
          teamCollaboration: true,
          advancedScheduling: true,
        }),
        sortOrder: 4,
        isVisible: true,
        isPopular: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ], {});
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('subscription_plans', null, {});
  }
};
