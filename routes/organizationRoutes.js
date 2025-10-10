/**
 * Organization Routes
 * 
 * Defines all HTTP routes for organization management.
 * All routes require authentication and tenant context.
 */

const express = require("express");
const router = express.Router();
const organizationController = require("../controllers/organizationController");
const subscriptionController = require("../controllers/subscriptionController");
const { authenticate } = require("../middleware/authenticate");
const { tenantContext, requireRole } = require("../middleware/tenantContext");
const { withTenantContext } = require("../middleware/tenantIsolation");

// Apply authentication to all organization routes
router.use(authenticate);

// ============================================
// Organization Management Routes
// ============================================

/**
 * GET /api/organizations/current
 * Get current user's organization
 */
router.get(
  "/current",
  tenantContext,
  withTenantContext,
  organizationController.getCurrentOrganization
);

/**
 * GET /api/organizations/:id
 * Get organization by ID
 * Requires: User must belong to the organization
 */
router.get(
  "/:id",
  tenantContext,
  withTenantContext,
  organizationController.getOrganizationById
);

/**
 * POST /api/organizations
 * Create new organization
 * Note: Usually done during registration, but can be used for creating additional orgs
 */
router.post(
  "/",
  organizationController.createOrganization
);

/**
 * PUT /api/organizations/:id
 * Update organization details
 * Requires: owner or admin role
 */
router.put(
  "/:id",
  tenantContext,
  withTenantContext,
  requireRole("owner", "admin"),
  organizationController.updateOrganization
);

/**
 * POST /api/organizations/:id/suspend
 * Suspend organization
 * Requires: owner role
 */
router.post(
  "/:id/suspend",
  tenantContext,
  withTenantContext,
  requireRole("owner"),
  organizationController.suspendOrganization
);

/**
 * POST /api/organizations/:id/reactivate
 * Reactivate suspended organization
 * Requires: owner role
 */
router.post(
  "/:id/reactivate",
  tenantContext,
  withTenantContext,
  requireRole("owner"),
  organizationController.reactivateOrganization
);

/**
 * DELETE /api/organizations/:id
 * Delete organization (soft delete)
 * Requires: owner role
 */
router.delete(
  "/:id",
  tenantContext,
  withTenantContext,
  requireRole("owner"),
  organizationController.deleteOrganization
);

// ============================================
// Organization Statistics Routes
// ============================================

/**
 * GET /api/organizations/:id/stats
 * Get organization statistics
 * Requires: member access
 */
router.get(
  "/:id/stats",
  tenantContext,
  withTenantContext,
  organizationController.getOrganizationStats
);

// ============================================
// Team Management Routes
// ============================================

/**
 * GET /api/organizations/:id/users
 * Get all users in organization
 * Requires: member access
 */
router.get(
  "/:id/users",
  tenantContext,
  withTenantContext,
  organizationController.getOrganizationUsers
);

/**
 * POST /api/organizations/:id/users
 * Add user to organization
 * Requires: owner or admin role
 * Body: { userId, roleInOrg }
 */
router.post(
  "/:id/users",
  tenantContext,
  withTenantContext,
  requireRole("owner", "admin"),
  organizationController.addUserToOrganization
);

/**
 * DELETE /api/organizations/:id/users/:userId
 * Remove user from organization
 * Requires: owner or admin role
 */
router.delete(
  "/:id/users/:userId",
  tenantContext,
  withTenantContext,
  requireRole("owner", "admin"),
  organizationController.removeUserFromOrganization
);

/**
 * PUT /api/organizations/:id/users/:userId/role
 * Update user role in organization
 * Requires: owner role
 * Body: { roleInOrg }
 */
router.put(
  "/:id/users/:userId/role",
  tenantContext,
  withTenantContext,
  requireRole("owner"),
  organizationController.updateUserRole
);

// ============================================
// Subscription Routes (under organization context)
// ============================================

/**
 * GET /api/organizations/subscriptions/plans
 * Get all available subscription plans
 * No tenant context needed (public plans)
 */
router.get(
  "/subscriptions/plans",
  subscriptionController.getAllPlans
);

/**
 * GET /api/organizations/subscriptions/plans/:planId
 * Get specific plan details
 * No tenant context needed (public plans)
 */
router.get(
  "/subscriptions/plans/:planId",
  subscriptionController.getPlanById
);

/**
 * GET /api/organizations/subscriptions/current
 * Get current subscription for organization
 * Requires: tenant context
 */
router.get(
  "/subscriptions/current",
  tenantContext,
  withTenantContext,
  subscriptionController.getCurrentSubscription
);

/**
 * GET /api/organizations/subscriptions/summary
 * Get subscription summary with usage
 * Requires: tenant context
 */
router.get(
  "/subscriptions/summary",
  tenantContext,
  withTenantContext,
  subscriptionController.getSubscriptionSummary
);

/**
 * GET /api/organizations/subscriptions/history
 * Get subscription history
 * Requires: tenant context
 */
router.get(
  "/subscriptions/history",
  tenantContext,
  withTenantContext,
  subscriptionController.getSubscriptionHistory
);

/**
 * POST /api/organizations/subscriptions
 * Create new subscription
 * Requires: owner role
 * Body: { planId, billingCycle }
 */
router.post(
  "/subscriptions",
  tenantContext,
  withTenantContext,
  requireRole("owner"),
  subscriptionController.createSubscription
);

/**
 * POST /api/organizations/subscriptions/upgrade
 * Upgrade subscription
 * Requires: owner role
 * Body: { planId, billingCycle? }
 */
router.post(
  "/subscriptions/upgrade",
  tenantContext,
  withTenantContext,
  requireRole("owner"),
  subscriptionController.upgradeSubscription
);

/**
 * POST /api/organizations/subscriptions/downgrade
 * Downgrade subscription
 * Requires: owner role
 * Body: { planId, immediate? }
 */
router.post(
  "/subscriptions/downgrade",
  tenantContext,
  withTenantContext,
  requireRole("owner"),
  subscriptionController.downgradeSubscription
);

/**
 * POST /api/organizations/subscriptions/cancel
 * Cancel subscription
 * Requires: owner role
 * Body: { reason, immediate? }
 */
router.post(
  "/subscriptions/cancel",
  tenantContext,
  withTenantContext,
  requireRole("owner"),
  subscriptionController.cancelSubscription
);

/**
 * GET /api/organizations/subscriptions/quotas
 * Get current quotas for organization
 * Requires: tenant context
 */
router.get(
  "/subscriptions/quotas",
  tenantContext,
  withTenantContext,
  subscriptionController.getOrganizationQuotas
);

/**
 * GET /api/organizations/subscriptions/features
 * Get available features for organization
 * Requires: tenant context
 */
router.get(
  "/subscriptions/features",
  tenantContext,
  withTenantContext,
  subscriptionController.getOrganizationFeatures
);

/**
 * GET /api/organizations/subscriptions/features/:featureName
 * Check if organization has specific feature
 * Requires: tenant context
 */
router.get(
  "/subscriptions/features/:featureName",
  tenantContext,
  withTenantContext,
  subscriptionController.checkFeature
);

module.exports = router;
