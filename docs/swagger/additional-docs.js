/**
 * Additional Swagger Documentation
 * 
 * This file contains Swagger/OpenAPI documentation for subscription,
 * usage tracking, and other key endpoints.
 * 
 * Include this file in swagger.js apis array
 */

/**
 * @swagger
 * tags:
 *   - name: Authentication
 *     description: User authentication and registration
 *   - name: Organizations
 *     description: Organization management and settings
 *   - name: Subscriptions
 *     description: Subscription plans and billing
 *   - name: Users & Teams
 *     description: User management and team collaboration
 *   - name: Usage & Quotas
 *     description: Usage tracking and quota monitoring
 *   - name: Templates
 *     description: Message template management
 */

/**
 * @swagger
 * /api/organizations/{orgId}/subscription:
 *   get:
 *     tags: [Subscriptions]
 *     summary: Get current subscription
 *     description: Get the active subscription for an organization
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Current subscription details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 subscription:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     organizationId:
 *                       type: string
 *                       format: uuid
 *                     planId:
 *                       type: integer
 *                     status:
 *                       type: string
 *                       enum: [active, cancelled, expired, trial]
 *                     startsAt:
 *                       type: string
 *                       format: date-time
 *                     endsAt:
 *                       type: string
 *                       format: date-time
 *                     plan:
 *                       $ref: '#/components/schemas/SubscriptionPlan'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */

/**
 * @swagger
 * /api/organizations/{orgId}/subscription:
 *   put:
 *     tags: [Subscriptions]
 *     summary: Update subscription (upgrade/downgrade)
 *     description: Change subscription plan for an organization
 *     parameters:
 *       - in: path
 *         name: orgId
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
 *               - planId
 *               - action
 *             properties:
 *               planId:
 *                 type: integer
 *                 description: Target plan ID (1=Free, 2=Starter, 3=Pro, 4=Enterprise)
 *                 example: 3
 *               action:
 *                 type: string
 *                 enum: [upgrade, downgrade]
 *                 example: upgrade
 *     responses:
 *       200:
 *         description: Subscription updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 subscription:
 *                   type: object
 *       400:
 *         description: Invalid plan or action
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */

/**
 * @swagger
 * /api/organizations/{orgId}/subscription/cancel:
 *   post:
 *     tags: [Subscriptions]
 *     summary: Cancel subscription
 *     description: Cancel the current subscription (takes effect at end of billing period)
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 example: Too expensive
 *               feedback:
 *                 type: string
 *     responses:
 *       200:
 *         description: Subscription cancelled successfully
 */

/**
 * @swagger
 * /api/organizations/{orgId}/subscription/plans:
 *   get:
 *     tags: [Subscriptions]
 *     summary: Get all subscription plans
 *     description: List all available subscription plans with features and pricing
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: List of subscription plans
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 plans:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/SubscriptionPlan'
 */

/**
 * @swagger
 * /api/organizations/{orgId}/usage:
 *   get:
 *     tags: [Usage & Quotas]
 *     summary: Get organization usage metrics
 *     description: Get current usage statistics for all tracked metrics
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [daily, monthly, yearly]
 *           default: monthly
 *     responses:
 *       200:
 *         description: Usage metrics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 usage:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/UsageMetrics'
 *                 summary:
 *                   type: object
 *                   properties:
 *                     messagesSent:
 *                       type: object
 *                       properties:
 *                         current:
 *                           type: integer
 *                         limit:
 *                           type: integer
 *                         percentage:
 *                           type: number
 *                     whatsappAccounts:
 *                       type: object
 *                     templates:
 *                       type: object
 *                     storage:
 *                       type: object
 */

/**
 * @swagger
 * /api/organizations/{orgId}/usage/quota:
 *   get:
 *     tags: [Usage & Quotas]
 *     summary: Get quota limits
 *     description: Get all quota limits for the current subscription plan
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Quota limits
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 quotas:
 *                   type: object
 *                   properties:
 *                     maxWhatsappAccounts:
 *                       type: integer
 *                     maxMessagesPerMonth:
 *                       type: integer
 *                     maxCampaignsPerMonth:
 *                       type: integer
 *                     maxTemplates:
 *                       type: integer
 *                     maxUsers:
 *                       type: integer
 *                     maxStorageMb:
 *                       type: integer
 */

/**
 * @swagger
 * /api/organizations/{orgId}/users:
 *   get:
 *     tags: [Users & Teams]
 *     summary: List team members
 *     description: Get all users in the organization
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: List of team members
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 users:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/User'
 */

/**
 * @swagger
 * /api/organizations/{orgId}/users/invite:
 *   post:
 *     tags: [Users & Teams]
 *     summary: Invite user to organization
 *     description: Send invitation to join the organization (requires owner or admin role)
 *     parameters:
 *       - in: path
 *         name: orgId
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
 *               - email
 *               - role
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: newmember@example.com
 *               role:
 *                 type: string
 *                 enum: [admin, member]
 *                 example: member
 *               name:
 *                 type: string
 *                 example: John Doe
 *     responses:
 *       200:
 *         description: Invitation sent successfully
 *       400:
 *         description: User already in organization or invalid email
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */

/**
 * @swagger
 * /api/organizations/{orgId}/users/{userId}:
 *   delete:
 *     tags: [Users & Teams]
 *     summary: Remove user from organization
 *     description: Remove a team member (requires owner or admin role)
 *     parameters:
 *       - in: path
 *         name: orgId
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
 *         description: Cannot remove owner or insufficient permissions
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */

/**
 * @swagger
 * /api/organizations/{orgId}/users/{userId}/role:
 *   put:
 *     tags: [Users & Teams]
 *     summary: Change user role
 *     description: Update a user's role in the organization (owner only)
 *     parameters:
 *       - in: path
 *         name: orgId
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
 *                 example: admin
 *     responses:
 *       200:
 *         description: Role updated successfully
 *       403:
 *         description: Only owner can change roles
 */

/**
 * @swagger
 * /api/organizations/{orgId}/stats:
 *   get:
 *     tags: [Organizations]
 *     summary: Get organization statistics
 *     description: Get dashboard statistics for the organization
 *     parameters:
 *       - in: path
 *         name: orgId
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
 *                 success:
 *                   type: boolean
 *                 stats:
 *                   type: object
 *                   properties:
 *                     totalUsers:
 *                       type: integer
 *                     totalWhatsappAccounts:
 *                       type: integer
 *                     totalTemplates:
 *                       type: integer
 *                     totalCampaigns:
 *                       type: integer
 *                     messagesSentThisMonth:
 *                       type: integer
 *                     subscriptionStatus:
 *                       type: string
 *                     quotaUsage:
 *                       type: object
 */

/**
 * @swagger
 * /templates:
 *   get:
 *     tags: [Templates]
 *     summary: List all templates
 *     description: Get all message templates for the current organization
 *     responses:
 *       200:
 *         description: List of templates
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Template'
 *   post:
 *     tags: [Templates]
 *     summary: Create new template
 *     description: Create a new message template (checks quota limit)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - content
 *             properties:
 *               name:
 *                 type: string
 *                 example: Welcome Message
 *               content:
 *                 type: string
 *                 example: Hello {{name}}, welcome to our service!
 *               spinTextEnabled:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       201:
 *         description: Template created successfully
 *       403:
 *         $ref: '#/components/responses/QuotaExceededError'
 */

/**
 * @swagger
 * /templates/{id}:
 *   get:
 *     tags: [Templates]
 *     summary: Get template by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Template details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Template'
 *   put:
 *     tags: [Templates]
 *     summary: Update template
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               content:
 *                 type: string
 *               spinTextEnabled:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Template updated successfully
 *   delete:
 *     tags: [Templates]
 *     summary: Delete template
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Template deleted successfully
 */
