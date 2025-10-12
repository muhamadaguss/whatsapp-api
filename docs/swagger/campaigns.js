/**
 * @swagger
 * tags:
 *   name: Campaigns
 *   description: Blast campaign management endpoints
 */

/**
 * @swagger
 * /campaign/create:
 *   post:
 *     tags: [Campaigns]
 *     summary: Create new blast campaign
 *     description: Creates a new WhatsApp blast campaign with target contacts
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - sessionId
 *               - contacts
 *               - message
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Holiday Promotion"
 *               sessionId:
 *                 type: string
 *                 example: "my-session"
 *               contacts:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["6281234567890", "6281234567891"]
 *               message:
 *                 type: string
 *                 example: "Special offer for you!"
 *               templateId:
 *                 type: integer
 *                 example: 1
 *     responses:
 *       201:
 *         description: Campaign created successfully
 *       403:
 *         description: Campaign quota exceeded
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

/**
 * @swagger
 * /campaign/start/{campaignId}:
 *   post:
 *     tags: [Campaigns]
 *     summary: Start blast campaign
 *     description: Starts sending messages for a blast campaign
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: campaignId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Campaign ID
 *     responses:
 *       200:
 *         description: Campaign started successfully
 *       404:
 *         description: Campaign not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

/**
 * @swagger
 * /campaign/stop/{campaignId}:
 *   post:
 *     tags: [Campaigns]
 *     summary: Stop blast campaign
 *     description: Stops an active blast campaign
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: campaignId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Campaign ID
 *     responses:
 *       200:
 *         description: Campaign stopped successfully
 *       404:
 *         description: Campaign not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

/**
 * @swagger
 * /campaign/status/{campaignId}:
 *   get:
 *     tags: [Campaigns]
 *     summary: Get campaign status
 *     description: Returns current status and statistics of a blast campaign
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: campaignId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Campaign ID
 *     responses:
 *       200:
 *         description: Campaign status retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                 name:
 *                   type: string
 *                 status:
 *                   type: string
 *                   enum: [pending, running, paused, completed, failed]
 *                 totalContacts:
 *                   type: integer
 *                 sentCount:
 *                   type: integer
 *                 failedCount:
 *                   type: integer
 *                 progress:
 *                   type: number
 *                   format: float
 *       404:
 *         description: Campaign not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

/**
 * @swagger
 * /campaign/list:
 *   get:
 *     tags: [Campaigns]
 *     summary: Get all campaigns
 *     description: Returns list of all blast campaigns for current organization
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, running, paused, completed, failed]
 *         description: Filter by campaign status
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Items per page
 *     responses:
 *       200:
 *         description: List of campaigns
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 campaigns:
 *                   type: array
 *                   items:
 *                     type: object
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
