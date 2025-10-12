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
const { verifyToken } = require("../middleware/authMiddleware");
const { tenantContext, requireRole } = require("../middleware/tenantContext");
const { withTenantContext } = require("../middleware/tenantIsolation");

// Apply authentication to all organization routes
router.use(verifyToken);

// ============================================
// Organization Management Routes
// ============================================

/**
 * @swagger
 * /api/organizations/current:
 *   get:
 *     tags: [Organizations]
 *     summary: Get current organization
 *     description: Get the organization details for the current user
 *     responses:
 *       200:
 *         description: Organization details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 organization:
 *                   $ref: '#/components/schemas/Organization'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.get(
  "/current",
  tenantContext,
  withTenantContext,
  organizationController.getCurrentOrganization
);

/**
 * @swagger
 * /api/organizations/{id}:
 *   get:
 *     tags: [Organizations]
 *     summary: Get organization by ID
 *     description: Get details of a specific organization (user must belong to it)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Organization UUID
 *     responses:
 *       200:
 *         description: Organization details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Organization'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.get(
  "/:id",
  tenantContext,
  withTenantContext,
  organizationController.getOrganization
);

/**
 * @swagger
 * /api/organizations:
 *   post:
 *     tags: [Organizations]
 *     summary: Create new organization
 *     description: Create a new organization (user becomes owner)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *             properties:
 *               name:
 *                 type: string
 *                 example: My New Company
 *               email:
 *                 type: string
 *                 format: email
 *                 example: info@mynewcompany.com
 *               phone:
 *                 type: string
 *                 example: +62812345678
 *               timezone:
 *                 type: string
 *                 example: Asia/Jakarta
 *               currency:
 *                 type: string
 *                 example: IDR
 *     responses:
 *       201:
 *         description: Organization created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 organization:
 *                   $ref: '#/components/schemas/Organization'
 *       400:
 *         description: Invalid input
 */
router.post(
  "/",
  organizationController.createOrganization
);

/**
 * @swagger
 * /api/organizations/{id}:
 *   put:
 *     tags: [Organizations]
 *     summary: Update organization details
 *     description: Update organization information (requires owner or admin role)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: Updated Company Name
 *               email:
 *                 type: string
 *                 format: email
 *               phone:
 *                 type: string
 *               timezone:
 *                 type: string
 *               settings:
 *                 type: object
 *     responses:
 *       200:
 *         description: Organization updated successfully
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
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
  organizationController.addUser
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
  organizationController.removeUser
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
