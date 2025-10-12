/**
 * Swagger/OpenAPI Configuration
 * Interactive API Documentation & Testing UI
 * Access at: http://localhost:3000/api-docs
 */

const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'WhatsApp Blast SaaS API',
      version: '1.0.0',
      description: `
Multi-tenant WhatsApp Blast Management System API

## Features
- 🏢 Multi-tenant Organization Management
- 💳 Subscription & Billing Management
- 📊 Usage Tracking & Quota Enforcement
- 👥 Team Collaboration (RBAC)
- 📱 WhatsApp Integration (Baileys)
- 📤 Bulk Message Blast with Spin Text
- 📈 Analytics & Reporting
- 🔔 Real-time Notifications (Socket.IO)

## Authentication
All protected endpoints require a Bearer token in the Authorization header.

**Login** to get your token:
\`\`\`
POST /api/auth/login
{
  "email": "user@example.com",
  "password": "password123"
}
\`\`\`

Then use the token in subsequent requests:
\`\`\`
Authorization: Bearer <your_token_here>
\`\`\`

## Multi-Tenancy
- Each organization is isolated (tenant)
- All data queries are automatically filtered by organizationId
- Users can belong to multiple organizations
- Role-based permissions: owner, admin, member

## Quota System
- Each subscription plan has different quotas
- Soft limits: warnings at 80%, 95% usage
- Hard limits: blocks at 100% usage
- Grace period for recent upgrades/downgrades

## Testing
You can test all endpoints directly in this UI using the "Try it out" button.
      `.trim(),
      contact: {
        name: 'API Support',
        email: 'support@example.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server'
      },
      {
        url: 'https://api.yourdomain.com',
        description: 'Production server (change this)'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your JWT token from /api/auth/login'
        }
      },
      schemas: {
        // Common schemas
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string', example: 'Error message' },
            message: { type: 'string', example: 'Detailed error description' },
            details: { type: 'object' }
          }
        },
        Success: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Operation successful' },
            data: { type: 'object' }
          }
        },
        
        // Organization schemas
        Organization: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', example: '123e4567-e89b-12d3-a456-426614174000' },
            name: { type: 'string', example: 'Acme Corporation' },
            slug: { type: 'string', example: 'acme-corp' },
            email: { type: 'string', format: 'email', example: 'admin@acme.com' },
            phone: { type: 'string', example: '+62812345678' },
            ownerId: { type: 'integer', example: 1 },
            subscriptionPlan: { 
              type: 'string', 
              enum: ['free', 'starter', 'pro', 'enterprise'],
              example: 'pro'
            },
            subscriptionStatus: {
              type: 'string',
              enum: ['active', 'suspended', 'cancelled', 'trial'],
              example: 'active'
            },
            isActive: { type: 'boolean', example: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        
        // Subscription Plan schemas
        SubscriptionPlan: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            name: { type: 'string', example: 'pro' },
            displayName: { type: 'string', example: 'Professional' },
            description: { type: 'string', example: 'For growing businesses' },
            priceMonthly: { type: 'number', example: 500000 },
            priceYearly: { type: 'number', example: 5000000 },
            currency: { type: 'string', example: 'IDR' },
            quotas: {
              type: 'object',
              properties: {
                maxWhatsappAccounts: { type: 'integer', example: 10 },
                maxMessagesPerMonth: { type: 'integer', example: 20000 },
                maxCampaignsPerMonth: { type: 'integer', example: 200 },
                maxContacts: { type: 'integer', example: 20000 },
                maxTemplates: { type: 'integer', example: 100 },
                maxUsers: { type: 'integer', example: 10 },
                maxStorageMb: { type: 'integer', example: 2000 }
              }
            },
            features: {
              type: 'object',
              properties: {
                spinText: { type: 'boolean', example: true },
                advancedAnalytics: { type: 'boolean', example: true },
                apiAccess: { type: 'boolean', example: true }
              }
            }
          }
        },
        
        // User schemas
        User: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            name: { type: 'string', example: 'John Doe' },
            email: { type: 'string', format: 'email', example: 'john@example.com' },
            organizationId: { type: 'string', format: 'uuid' },
            roleInOrg: {
              type: 'string',
              enum: ['owner', 'admin', 'member'],
              example: 'admin'
            },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        
        // Usage Tracking schemas
        UsageMetrics: {
          type: 'object',
          properties: {
            metricType: { type: 'string', example: 'messages_sent' },
            currentUsage: { type: 'integer', example: 1500 },
            limit: { type: 'integer', example: 20000 },
            percentageUsed: { type: 'number', example: 7.5 },
            periodStart: { type: 'string', format: 'date-time' },
            periodEnd: { type: 'string', format: 'date-time' }
          }
        },
        
        // Template schemas
        Template: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            organizationId: { type: 'string', format: 'uuid' },
            name: { type: 'string', example: 'Promo Template' },
            content: { type: 'string', example: 'Hello {{name}}, check our promo!' },
            spinTextEnabled: { type: 'boolean', example: true },
            createdAt: { type: 'string', format: 'date-time' }
          }
        }
      },
      responses: {
        UnauthorizedError: {
          description: 'Access token is missing or invalid',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              },
              example: {
                error: 'Unauthorized',
                message: 'Please provide a valid token'
              }
            }
          }
        },
        ForbiddenError: {
          description: 'Insufficient permissions',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              },
              example: {
                error: 'Forbidden',
                message: 'You do not have permission to perform this action'
              }
            }
          }
        },
        NotFoundError: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              },
              example: {
                error: 'Not Found',
                message: 'The requested resource was not found'
              }
            }
          }
        },
        QuotaExceededError: {
          description: 'Quota limit exceeded',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              },
              example: {
                error: 'Quota Exceeded',
                message: 'You have reached your monthly message limit',
                usage: 20000,
                limit: 20000,
                upgradeUrl: '/subscription/upgrade'
              }
            }
          }
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ],
    tags: [
      {
        name: 'Authentication',
        description: 'User authentication and registration'
      },
      {
        name: 'Organizations',
        description: 'Multi-tenant organization management'
      },
      {
        name: 'Subscriptions',
        description: 'Subscription plans and billing'
      },
      {
        name: 'Users & Teams',
        description: 'User management and team collaboration'
      },
      {
        name: 'Usage & Quotas',
        description: 'Usage tracking and quota monitoring'
      },
      {
        name: 'Templates',
        description: 'Message template management'
      },
      {
        name: 'Campaigns',
        description: 'Blast campaign management'
      },
      {
        name: 'WhatsApp',
        description: 'WhatsApp account and messaging'
      },
      {
        name: 'Analytics',
        description: 'Analytics and reporting'
      }
    ]
  },
  // Path to API route files with JSDoc annotations
  apis: [
    './routes/*.js',
    './controllers/*.js',
    './docs/swagger/*.js',
    './docs/swagger/*.yaml' // Optional: separate YAML files
  ]
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
