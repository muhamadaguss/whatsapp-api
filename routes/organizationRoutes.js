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
 * @swagger
 * /api/organizations/{id}/suspend:
 *   post:
 *     tags: [Organizations]
 *     summary: Suspend organization
 *     description: Suspends an organization (requires owner role)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Organization suspended successfully
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.post(
  "/:id/suspend",
  tenantContext,
  withTenantContext,
  requireRole("owner"),
  organizationController.suspendOrganization
);

/**
 * @swagger
 * /api/organizations/{id}/reactivate:
 *   post:
 *     tags: [Organizations]
 *     summary: Reactivate suspended organization
 *     description: Reactivates a suspended organization (requires owner role)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Organization reactivated successfully
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.post(
  "/:id/reactivate",
  tenantContext,
  withTenantContext,
  requireRole("owner"),
  organizationController.reactivateOrganization
);

/**
 * @swagger
 * /api/organizations/{id}:
 *   delete:
 *     tags: [Organizations]
 *     summary: Delete organization
 *     description: Soft deletes an organization (requires owner role)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Organization deleted successfully
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
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
 * @swagger
 * /api/organizations/{id}/stats:
 *   get:
 *     tags: [Organizations]
 *     summary: Get organization statistics
 *     description: Returns statistics for the organization
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Organization statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalUsers:
 *                   type: integer
 *                 activeSessions:
 *                   type: integer
 *                 messagesSent:
 *                   type: integer
 *                 storageUsed:
 *                   type: string
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
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
 * @swagger
 * /api/organizations/{id}/users:
 *   get:
 *     tags: [Organizations]
 *     summary: Get all users in organization
 *     description: Returns list of users in the organization
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: List of users
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 users:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       username:
 *                         type: string
 *                       email:
 *                         type: string
 *                       roleInOrg:
 *                         type: string
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.get(
  "/:id/users",
  tenantContext,
  withTenantContext,
  organizationController.getOrganizationUsers
);

/**
 * @swagger
 * /api/organizations/{id}/users:
 *   post:
 *     tags: [Organizations]
 *     summary: Add user to organization
 *     description: Adds a user to the organization (requires owner or admin role)
 *     security:
 *       - bearerAuth: []
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
 *             required:
 *               - userId
 *               - roleInOrg
 *             properties:
 *               userId:
 *                 type: integer
 *               roleInOrg:
 *                 type: string
 *                 enum: [owner, admin, member]
 *     responses:
 *       200:
 *         description: User added successfully
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.post(
  "/:id/users",
  tenantContext,
  withTenantContext,
  requireRole("owner", "admin"),
  organizationController.addUser
);

/**
 * @swagger
 * /api/organizations/{id}/users/{userId}:
 *   delete:
 *     tags: [Organizations]
 *     summary: Remove user from organization
 *     description: Removes a user from the organization (requires owner or admin role)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: User removed successfully
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.delete(
  "/:id/users/:userId",
  tenantContext,
  withTenantContext,
  requireRole("owner", "admin"),
  organizationController.removeUser
);

/**
 * @swagger
 * /api/organizations/{id}/users/{userId}/role:
 *   put:
 *     tags: [Organizations]
 *     summary: Update user role in organization
 *     description: Updates a user's role in the organization (requires owner role)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - roleInOrg
 *             properties:
 *               roleInOrg:
 *                 type: string
 *                 enum: [owner, admin, member]
 *     responses:
 *       200:
 *         description: User role updated successfully
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
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
 * @swagger
 * /api/organizations/subscriptions/plans:
 *   get:
 *     tags: [Subscriptions]
 *     summary: Get all available subscription plans
 *     description: Returns all public subscription plans (no authentication required)
 *     responses:
 *       200:
 *         description: List of subscription plans
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 plans:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/SubscriptionPlan'
 */
router.get(
  "/subscriptions/plans",
  subscriptionController.getAllPlans
);

/**
 * @swagger
 * /api/organizations/subscriptions/plans/{planId}:
 *   get:
 *     tags: [Subscriptions]
 *     summary: Get specific plan details
 *     description: Returns details of a specific subscription plan
 *     parameters:
 *       - in: path
 *         name: planId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Plan details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SubscriptionPlan'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.get(
  "/subscriptions/plans/:planId",
  subscriptionController.getPlanById
);

/**
 * @swagger
 * /api/organizations/subscriptions/current:
 *   get:
 *     tags: [Subscriptions]
 *     summary: Get current subscription
 *     description: Returns current subscription for the organization
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current subscription
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 subscription:
 *                   $ref: '#/components/schemas/Subscription'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get(
  "/subscriptions/current",
  tenantContext,
  withTenantContext,
  subscriptionController.getCurrentSubscription
);

/**
 * @swagger
 * /api/organizations/subscriptions/summary:
 *   get:
 *     tags: [Subscriptions]
 *     summary: Get subscription summary with usage
 *     description: Returns subscription summary including usage statistics
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Subscription summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 subscription:
 *                   $ref: '#/components/schemas/Subscription'
 *                 usage:
 *                   type: object
 *                 quotas:
 *                   type: object
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get(
  "/subscriptions/summary",
  tenantContext,
  withTenantContext,
  subscriptionController.getSubscriptionSummary
);

/**
 * @swagger
 * /api/organizations/subscriptions/history:
 *   get:
 *     tags: [Subscriptions]
 *     summary: Get subscription history
 *     description: Returns history of all subscriptions for the organization
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Subscription history
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 history:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Subscription'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get(
  "/subscriptions/history",
  tenantContext,
  withTenantContext,
  subscriptionController.getSubscriptionHistory
);

/**
 * @swagger
 * /api/organizations/subscriptions:
 *   post:
 *     tags: [Subscriptions]
 *     summary: Create new subscription
 *     description: Creates a new subscription for the organization (requires owner role)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - planId
 *               - billingCycle
 *             properties:
 *               planId:
 *                 type: string
 *               billingCycle:
 *                 type: string
 *                 enum: [monthly, yearly]
 *     responses:
 *       201:
 *         description: Subscription created successfully
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.post(
  "/subscriptions",
  tenantContext,
  withTenantContext,
  requireRole("owner"),
  subscriptionController.createSubscription
);

/**
 * @swagger
 * /api/organizations/subscriptions/upgrade:
 *   post:
 *     tags: [Subscriptions]
 *     summary: Upgrade subscription
 *     description: Upgrades current subscription to a higher plan (requires owner role)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - planId
 *             properties:
 *               planId:
 *                 type: string
 *               billingCycle:
 *                 type: string
 *                 enum: [monthly, yearly]
 *     responses:
 *       200:
 *         description: Subscription upgraded successfully
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.post(
  "/subscriptions/upgrade",
  tenantContext,
  withTenantContext,
  requireRole("owner"),
  subscriptionController.upgradeSubscription
);

/**
 * @swagger
 * /api/organizations/subscriptions/downgrade:
 *   post:
 *     tags: [Subscriptions]
 *     summary: Downgrade subscription
 *     description: Downgrades current subscription to a lower plan (requires owner role)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - planId
 *             properties:
 *               planId:
 *                 type: string
 *               immediate:
 *                 type: boolean
 *                 description: Apply downgrade immediately or at end of billing period
 *     responses:
 *       200:
 *         description: Subscription downgraded successfully
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.post(
  "/subscriptions/downgrade",
  tenantContext,
  withTenantContext,
  requireRole("owner"),
  subscriptionController.downgradeSubscription
);

/**
 * @swagger
 * /api/organizations/subscriptions/cancel:
 *   post:
 *     tags: [Subscriptions]
 *     summary: Cancel subscription
 *     description: Cancels the current subscription (requires owner role)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *               immediate:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Subscription cancelled successfully
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.post(
  "/subscriptions/cancel",
  tenantContext,
  withTenantContext,
  requireRole("owner"),
  subscriptionController.cancelSubscription
);

/**
 * @swagger
 * /api/organizations/subscriptions/quotas:
 *   get:
 *     tags: [Subscriptions]
 *     summary: Get current quotas
 *     description: Returns current quotas and usage for the organization
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Quota information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 quotas:
 *                   type: object
 *                   properties:
 *                     messagesPerDay:
 *                       type: integer
 *                     sessions:
 *                       type: integer
 *                     storage:
 *                       type: string
 *                 usage:
 *                   type: object
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get(
  "/subscriptions/quotas",
  tenantContext,
  withTenantContext,
  subscriptionController.getOrganizationQuotas
);

/**
 * @swagger
 * /api/organizations/subscriptions/features:
 *   get:
 *     tags: [Subscriptions]
 *     summary: Get available features
 *     description: Returns list of features available for the organization
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Available features
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 features:
 *                   type: array
 *                   items:
 *                     type: string
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get(
  "/subscriptions/features",
  tenantContext,
  withTenantContext,
  subscriptionController.getOrganizationFeatures
);

/**
 * @swagger
 * /api/organizations/subscriptions/features/{featureName}:
 *   get:
 *     tags: [Subscriptions]
 *     summary: Check if organization has specific feature
 *     description: Returns whether the organization has access to a specific feature
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: featureName
 *         required: true
 *         schema:
 *           type: string
 *         example: advanced_analytics
 *     responses:
 *       200:
 *         description: Feature availability
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 hasFeature:
 *                   type: boolean
 *                 feature:
 *                   type: string
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get(
  "/subscriptions/features/:featureName",
  tenantContext,
  withTenantContext,
  subscriptionController.checkFeature
);

module.exports = router;
