# 📘 Sequelize Models & Migrations Guide - SaaS Multi-Tenant

## 🎯 Overview

Panduan lengkap untuk membuat Sequelize Models dan Migrations untuk transformasi SaaS multi-tenant.

**PENTING:** Kita menggunakan Sequelize, BUKAN script SQL manual!

---

## 📁 File Structure

```
whatsapp/
├── models/
│   ├── db.js                          # Sequelize instance (existing)
│   ├── associations.js                # Model associations (existing)
│   │
│   ├── organizationModel.js           # ✨ NEW - Organizations/Tenants
│   ├── subscriptionPlanModel.js       # ✨ NEW - Plan definitions
│   ├── subscriptionModel.js           # ✨ NEW - Active subscriptions
│   ├── usageTrackingModel.js          # ✨ NEW - Usage metrics
│   ├── quotaAlertModel.js             # ✨ NEW - Quota alerts
│   │
│   ├── userModel.js                   # 🔄 MODIFY - Add organizationId
│   ├── sessionModel.js                # 🔄 MODIFY - Add organizationId
│   ├── blastSessionModel.js           # 🔄 MODIFY - Add organizationId
│   ├── blastMessageModel.js           # 🔄 MODIFY - Add organizationId
│   ├── campaignModel.js               # 🔄 MODIFY - Add organizationId (if exists)
│   ├── templateModel.js               # 🔄 MODIFY - Add organizationId
│   └── chatModel.js                   # 🔄 MODIFY - Add organizationId
│
├── migrations/
│   ├── 20251010100000-create-organizations.js
│   ├── 20251010100001-create-subscription-plans.js
│   ├── 20251010100002-create-subscriptions.js
│   ├── 20251010100003-create-usage-tracking.js
│   ├── 20251010100004-create-quota-alerts.js
│   ├── 20251010100005-add-organization-to-users.js
│   ├── 20251010100006-add-organization-to-sessions.js
│   ├── 20251010100007-add-organization-to-blast-sessions.js
│   ├── 20251010100008-add-organization-to-blast-messages.js
│   ├── 20251010100009-add-organization-to-templates.js
│   └── 20251010100010-add-organization-to-chats.js
│
└── seeders/
    └── 20251010100000-seed-subscription-plans.js
```

---

## 🆕 NEW MODELS

### 1. Organization Model (`organizationModel.js`)

```javascript
// models/organizationModel.js
const { DataTypes } = require("sequelize");
const sequelize = require("./db");

const Organization = sequelize.define(
  "Organization",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    slug: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
      comment: 'URL-friendly identifier for organization',
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true,
      },
    },
    phone: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    
    // Owner reference
    ownerId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id',
      },
      comment: 'User who owns this organization',
    },
    
    // Subscription info (denormalized for quick access)
    subscriptionPlan: {
      type: DataTypes.ENUM('free', 'starter', 'pro', 'enterprise'),
      defaultValue: 'free',
    },
    subscriptionStatus: {
      type: DataTypes.ENUM('active', 'suspended', 'cancelled', 'trial'),
      defaultValue: 'trial',
    },
    trialEndsAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    subscriptionStartsAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    subscriptionEndsAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    
    // Settings
    settings: {
      type: DataTypes.JSON,
      defaultValue: {},
      comment: 'Organization-specific settings',
    },
    timezone: {
      type: DataTypes.STRING(100),
      defaultValue: 'Asia/Jakarta',
    },
    currency: {
      type: DataTypes.STRING(10),
      defaultValue: 'IDR',
    },
    
    // Status
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    suspendedReason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    suspendedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    
    // Soft delete
    deletedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    timestamps: true,
    paranoid: true, // Enable soft delete
    tableName: "organizations",
    indexes: [
      {
        fields: ["slug"],
      },
      {
        fields: ["email"],
      },
      {
        fields: ["ownerId"],
      },
      {
        fields: ["subscriptionPlan"],
      },
      {
        fields: ["subscriptionStatus"],
      },
      {
        fields: ["isActive"],
      },
    ],
  }
);

module.exports = Organization;
```

---

### 2. SubscriptionPlan Model (`subscriptionPlanModel.js`)

```javascript
// models/subscriptionPlanModel.js
const { DataTypes } = require("sequelize");
const sequelize = require("./db");

const SubscriptionPlan = sequelize.define(
  "SubscriptionPlan",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
      comment: 'Internal plan name: free, starter, pro, enterprise',
    },
    displayName: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'User-facing plan name',
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    
    // Pricing (reference only, not for actual billing yet)
    priceMonthly: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
      comment: 'Monthly price in specified currency',
    },
    priceYearly: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
      comment: 'Yearly price in specified currency',
    },
    currency: {
      type: DataTypes.STRING(10),
      defaultValue: 'IDR',
    },
    
    // Quotas
    quotas: {
      type: DataTypes.JSON,
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
      comment: 'Plan quota limits',
    },
    
    // Features
    features: {
      type: DataTypes.JSON,
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
      comment: 'Plan feature flags',
    },
    
    // Display
    sortOrder: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Order for displaying plans',
    },
    isVisible: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: 'Show plan in UI',
    },
    isPopular: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Mark as popular/recommended',
    },
  },
  {
    timestamps: true,
    tableName: "subscription_plans",
    indexes: [
      {
        fields: ["name"],
      },
      {
        fields: ["isVisible"],
      },
      {
        fields: ["sortOrder"],
      },
    ],
  }
);

module.exports = SubscriptionPlan;
```

---

### 3. Subscription Model (`subscriptionModel.js`)

```javascript
// models/subscriptionModel.js
const { DataTypes } = require("sequelize");
const sequelize = require("./db");

const Subscription = sequelize.define(
  "Subscription",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    organizationId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'organizations',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    planId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'subscription_plans',
        key: 'id',
      },
    },
    
    // Status
    status: {
      type: DataTypes.ENUM('active', 'cancelled', 'expired', 'trial'),
      defaultValue: 'trial',
    },
    
    // Dates
    startsAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    endsAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Null for lifetime subscriptions',
    },
    trialEndsAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    cancelledAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    
    // Billing
    billingCycle: {
      type: DataTypes.ENUM('monthly', 'yearly', 'lifetime'),
      defaultValue: 'monthly',
    },
    autoRenew: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    
    // Metadata
    metadata: {
      type: DataTypes.JSON,
      defaultValue: {},
      comment: 'Additional subscription data',
    },
  },
  {
    timestamps: true,
    tableName: "subscriptions",
    indexes: [
      {
        fields: ["organizationId"],
      },
      {
        fields: ["planId"],
      },
      {
        fields: ["status"],
      },
      {
        fields: ["startsAt"],
      },
      {
        fields: ["endsAt"],
      },
    ],
  }
);

module.exports = Subscription;
```

---

### 4. UsageTracking Model (`usageTrackingModel.js`)

```javascript
// models/usageTrackingModel.js
const { DataTypes } = require("sequelize");
const sequelize = require("./db");

const UsageTracking = sequelize.define(
  "UsageTracking",
  {
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
    },
    organizationId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'organizations',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    
    // Metrics
    metricType: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: 'Type: messages_sent, whatsapp_accounts, storage_used, api_calls, etc',
    },
    metricValue: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    
    // Metadata
    metadata: {
      type: DataTypes.JSON,
      defaultValue: {},
      comment: 'Additional context: sessionId, campaignId, etc',
    },
    
    // Period tracking
    periodType: {
      type: DataTypes.ENUM('daily', 'monthly', 'yearly'),
      defaultValue: 'monthly',
    },
    periodStart: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    periodEnd: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    
    // Recording time
    recordedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    timestamps: true,
    updatedAt: false, // Only track creation
    tableName: "usage_tracking",
    indexes: [
      {
        fields: ["organizationId", "metricType"],
      },
      {
        fields: ["periodStart", "periodEnd"],
      },
      {
        fields: ["metricType"],
      },
      {
        fields: ["recordedAt"],
      },
    ],
  }
);

module.exports = UsageTracking;
```

---

### 5. QuotaAlert Model (`quotaAlertModel.js`)

```javascript
// models/quotaAlertModel.js
const { DataTypes } = require("sequelize");
const sequelize = require("./db");

const QuotaAlert = sequelize.define(
  "QuotaAlert",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    organizationId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'organizations',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    
    // Alert details
    quotaType: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: 'Type: messages, accounts, storage, etc',
    },
    currentUsage: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    quotaLimit: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    percentageUsed: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      comment: 'Percentage: 0.00 - 100.00',
    },
    
    // Alert level
    alertLevel: {
      type: DataTypes.ENUM('warning', 'critical', 'exceeded'),
      allowNull: false,
      comment: 'warning: 80%, critical: 95%, exceeded: 100%',
    },
    
    // Status
    isResolved: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    resolvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    
    // Notification
    notificationSent: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    notificationSentAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    timestamps: true,
    tableName: "quota_alerts",
    indexes: [
      {
        fields: ["organizationId"],
      },
      {
        fields: ["quotaType"],
      },
      {
        fields: ["alertLevel"],
      },
      {
        fields: ["isResolved"],
      },
    ],
  }
);

module.exports = QuotaAlert;
```

---

## 🔄 MODIFY EXISTING MODELS

### Pattern untuk Semua Model

Tambahkan field `organizationId` ke SEMUA model existing:

```javascript
// Add to every existing model
{
  organizationId: {
    type: DataTypes.UUID,
    allowNull: true, // Allow null for backward compatibility
    references: {
      model: 'organizations',
      key: 'id',
    },
    onDelete: 'CASCADE',
    comment: 'Organization/Tenant ID for multi-tenant isolation',
  }
}

// Add index
indexes: [
  // ... existing indexes ...
  {
    fields: ['organizationId']
  }
]
```

### Example: User Model Modification

```javascript
// models/userModel.js - ADD THESE FIELDS

const User = sequelize.define(
  "User",
  {
    // ... existing fields ...
    
    // ✨ ADD THESE
    organizationId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'organizations',
        key: 'id',
      },
      onDelete: 'SET NULL',
    },
    roleInOrg: {
      type: DataTypes.ENUM('owner', 'admin', 'member'),
      defaultValue: 'member',
      comment: 'Role within the organization',
    },
  },
  {
    // ... existing options ...
    indexes: [
      // ... existing indexes ...
      { fields: ['organizationId'] },
      { fields: ['roleInOrg'] },
    ],
  }
);
```

---

## 📝 MIGRATIONS

### Example: Create Organizations Table

```javascript
// migrations/20251010100000-create-organizations.js
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
      },
      subscriptionPlan: {
        type: Sequelize.ENUM('free', 'starter', 'pro', 'enterprise'),
        defaultValue: 'free',
      },
      subscriptionStatus: {
        type: Sequelize.ENUM('active', 'suspended', 'cancelled', 'trial'),
        defaultValue: 'trial',
      },
      trialEndsAt: Sequelize.DATE,
      subscriptionStartsAt: Sequelize.DATE,
      subscriptionEndsAt: Sequelize.DATE,
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
      suspendedReason: Sequelize.TEXT,
      suspendedAt: Sequelize.DATE,
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      deletedAt: Sequelize.DATE,
    });

    // Add indexes
    await queryInterface.addIndex('organizations', ['slug']);
    await queryInterface.addIndex('organizations', ['email']);
    await queryInterface.addIndex('organizations', ['ownerId']);
    await queryInterface.addIndex('organizations', ['subscriptionPlan']);
    await queryInterface.addIndex('organizations', ['subscriptionStatus']);
    await queryInterface.addIndex('organizations', ['isActive']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('organizations');
  }
};
```

### Example: Add organizationId to Existing Table

```javascript
// migrations/20251010100005-add-organization-to-users.js
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add organizationId column
    await queryInterface.addColumn('users', 'organizationId', {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: 'organizations',
        key: 'id',
      },
      onDelete: 'SET NULL',
    });

    // Add roleInOrg column
    await queryInterface.addColumn('users', 'roleInOrg', {
      type: Sequelize.ENUM('owner', 'admin', 'member'),
      defaultValue: 'member',
    });

    // Add indexes
    await queryInterface.addIndex('users', ['organizationId']);
    await queryInterface.addIndex('users', ['roleInOrg']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('users', 'organizationId');
    await queryInterface.removeColumn('users', 'roleInOrg');
  }
};
```

---

## 🌱 SEEDERS

### Subscription Plans Seeder

```javascript
// seeders/20251010100000-seed-subscription-plans.js
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert('subscription_plans', [
      {
        name: 'free',
        displayName: 'Free Plan',
        description: 'Perfect for getting started',
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
        name: 'starter',
        displayName: 'Starter Plan',
        description: 'Great for small businesses',
        priceMonthly: 200000,
        priceYearly: 2000000,
        currency: 'IDR',
        quotas: JSON.stringify({
          maxWhatsappAccounts: 3,
          maxMessagesPerMonth: 5000,
          maxCampaignsPerMonth: 50,
          maxContacts: 5000,
          maxTemplates: 20,
          maxUsers: 3,
          maxStorageMb: 500,
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
        isPopular: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        name: 'pro',
        displayName: 'Pro Plan',
        description: 'For growing businesses',
        priceMonthly: 500000,
        priceYearly: 5000000,
        currency: 'IDR',
        quotas: JSON.stringify({
          maxWhatsappAccounts: 10,
          maxMessagesPerMonth: 20000,
          maxCampaignsPerMonth: 200,
          maxContacts: 20000,
          maxTemplates: 100,
          maxUsers: 10,
          maxStorageMb: 2000,
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
        name: 'enterprise',
        displayName: 'Enterprise Plan',
        description: 'Custom solutions for large organizations',
        priceMonthly: 0, // Custom pricing
        priceYearly: 0,
        currency: 'IDR',
        quotas: JSON.stringify({
          maxWhatsappAccounts: 999999,
          maxMessagesPerMonth: 999999,
          maxCampaignsPerMonth: 999999,
          maxContacts: 999999,
          maxTemplates: 999999,
          maxUsers: 999999,
          maxStorageMb: 999999,
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
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('subscription_plans', null, {});
  }
};
```

---

## 🔗 MODEL ASSOCIATIONS

Update `models/associations.js`:

```javascript
// models/associations.js
const User = require('./userModel');
const Organization = require('./organizationModel');
const SubscriptionPlan = require('./subscriptionPlanModel');
const Subscription = require('./subscriptionModel');
const UsageTracking = require('./usageTrackingModel');
const QuotaAlert = require('./quotaAlertModel');
// ... import other models ...

function setupAssociations() {
  // Organization associations
  Organization.belongsTo(User, { 
    as: 'owner', 
    foreignKey: 'ownerId' 
  });
  
  Organization.hasMany(User, { 
    as: 'members', 
    foreignKey: 'organizationId' 
  });
  
  Organization.hasMany(Subscription, { 
    as: 'subscriptions', 
    foreignKey: 'organizationId' 
  });
  
  Organization.hasMany(UsageTracking, { 
    as: 'usageRecords', 
    foreignKey: 'organizationId' 
  });
  
  Organization.hasMany(QuotaAlert, { 
    as: 'alerts', 
    foreignKey: 'organizationId' 
  });

  // Subscription associations
  Subscription.belongsTo(Organization, { 
    as: 'organization', 
    foreignKey: 'organizationId' 
  });
  
  Subscription.belongsTo(SubscriptionPlan, { 
    as: 'plan', 
    foreignKey: 'planId' 
  });

  // SubscriptionPlan associations
  SubscriptionPlan.hasMany(Subscription, { 
    as: 'subscriptions', 
    foreignKey: 'planId' 
  });

  // UsageTracking associations
  UsageTracking.belongsTo(Organization, { 
    as: 'organization', 
    foreignKey: 'organizationId' 
  });

  // QuotaAlert associations
  QuotaAlert.belongsTo(Organization, { 
    as: 'organization', 
    foreignKey: 'organizationId' 
  });

  // User associations
  User.belongsTo(Organization, { 
    as: 'organization', 
    foreignKey: 'organizationId' 
  });

  // ... existing associations ...
}

module.exports = setupAssociations;
```

---

## 🚀 Running Migrations

```bash
# 1. Create all migrations
npx sequelize-cli migration:generate --name create-organizations
npx sequelize-cli migration:generate --name create-subscription-plans
# ... etc

# 2. Run migrations
npx sequelize-cli db:migrate

# 3. Run seeders
npx sequelize-cli db:seed:all

# 4. Rollback if needed
npx sequelize-cli db:migrate:undo
npx sequelize-cli db:migrate:undo:all

# 5. Check status
npx sequelize-cli db:migrate:status
```

---

## ✅ Checklist

### Phase 1: Models
- [ ] Create `organizationModel.js`
- [ ] Create `subscriptionPlanModel.js`
- [ ] Create `subscriptionModel.js`
- [ ] Create `usageTrackingModel.js`
- [ ] Create `quotaAlertModel.js`
- [ ] Update `associations.js`

### Phase 2: Migrations
- [ ] Create organizations table migration
- [ ] Create subscription_plans table migration
- [ ] Create subscriptions table migration
- [ ] Create usage_tracking table migration
- [ ] Create quota_alerts table migration
- [ ] Add organizationId to users migration
- [ ] Add organizationId to sessions migration
- [ ] Add organizationId to blast_sessions migration
- [ ] Add organizationId to blast_messages migration
- [ ] Add organizationId to templates migration
- [ ] Add organizationId to chats migration

### Phase 3: Seeders
- [ ] Create subscription plans seeder
- [ ] Run seeder to populate plans

### Phase 4: Testing
- [ ] Test migrations run successfully
- [ ] Test associations work
- [ ] Test model CRUD operations
- [ ] Test queries with organizationId filter

---

## 📝 Notes

1. **NEVER write SQL manually** - Always use Sequelize models and migrations
2. **Test migrations** before running in production
3. **Backup database** before running migrations
4. **Check associations** work correctly with includes
5. **Add indexes** for organizationId on ALL tables
6. **Use transactions** for data integrity

---

**Last Updated:** October 10, 2025  
**Status:** 🟢 Ready to Implement
