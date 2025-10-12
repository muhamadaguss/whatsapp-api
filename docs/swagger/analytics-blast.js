/**
 * @swagger
 * tags:
 *   name: Analytics
 *   description: Analytics and reporting endpoints
 */

/**
 * @swagger
 * /api/blast/analytics:
 *   get:
 *     tags: [Analytics]
 *     summary: Get blast campaign analytics
 *     description: Returns comprehensive analytics for blast campaigns
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for analytics range
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for analytics range
 *       - in: query
 *         name: campaignId
 *         schema:
 *           type: string
 *         description: Filter by specific campaign
 *     responses:
 *       200:
 *         description: Analytics data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalCampaigns:
 *                   type: integer
 *                 totalMessagesSent:
 *                   type: integer
 *                 successRate:
 *                   type: number
 *                   format: float
 *                 failureRate:
 *                   type: number
 *                   format: float
 *                 averageResponseTime:
 *                   type: number
 *                 deliveryByDay:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       date:
 *                         type: string
 *                       sent:
 *                         type: integer
 *                       delivered:
 *                         type: integer
 *                       failed:
 *                         type: integer
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

/**
 * @swagger
 * /api/blast/best-time:
 *   get:
 *     tags: [Analytics]
 *     summary: Get best time to send messages
 *     description: Analyzes historical data to recommend optimal sending times
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: timezone
 *         schema:
 *           type: string
 *           default: "Asia/Jakarta"
 *     responses:
 *       200:
 *         description: Best time recommendations
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 bestHours:
 *                   type: array
 *                   items:
 *                     type: integer
 *                   example: [9, 10, 14, 15, 19]
 *                 bestDays:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["Monday", "Tuesday", "Wednesday"]
 *                 recommendations:
 *                   type: object
 *                   properties:
 *                     optimal:
 *                       type: string
 *                       example: "Tuesday at 10:00 AM"
 *                     responseRate:
 *                       type: number
 *                       format: float
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

/**
 * @swagger
 * /api/whatsapp/account-health:
 *   get:
 *     tags: [Analytics]
 *     summary: Get WhatsApp account health status
 *     description: Returns health metrics and quality score for WhatsApp account
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Account health status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [healthy, warning, critical]
 *                 qualityScore:
 *                   type: number
 *                   format: float
 *                   minimum: 0
 *                   maximum: 100
 *                 metrics:
 *                   type: object
 *                   properties:
 *                     messagesSent24h:
 *                       type: integer
 *                     messagesLimit24h:
 *                       type: integer
 *                     blockRate:
 *                       type: number
 *                       format: float
 *                     reportRate:
 *                       type: number
 *                       format: float
 *                     lastBlock:
 *                       type: string
 *                       format: date-time
 *                 recommendations:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example:
 *                     - "Reduce sending frequency"
 *                     - "Improve message quality"
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

/**
 * @swagger
 * /api/blast/risk-assessment:
 *   post:
 *     tags: [Analytics]
 *     summary: Assess blast campaign risk
 *     description: Analyzes blast campaign parameters and returns risk assessment
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sessionId
 *               - recipientCount
 *               - messageContent
 *             properties:
 *               sessionId:
 *                 type: string
 *               recipientCount:
 *                 type: integer
 *                 example: 1000
 *               messageContent:
 *                 type: string
 *               hasMedia:
 *                 type: boolean
 *               scheduledTime:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: Risk assessment result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 riskLevel:
 *                   type: string
 *                   enum: [low, medium, high, critical]
 *                 riskScore:
 *                   type: number
 *                   format: float
 *                   minimum: 0
 *                   maximum: 100
 *                 factors:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       factor:
 *                         type: string
 *                       impact:
 *                         type: string
 *                         enum: [low, medium, high]
 *                       description:
 *                         type: string
 *                 recommendations:
 *                   type: array
 *                   items:
 *                     type: string
 *                 shouldProceed:
 *                   type: boolean
 *                 suggestedDelay:
 *                   type: integer
 *                   description: Suggested delay in milliseconds between messages
 *       400:
 *         description: Invalid parameters
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

/**
 * @swagger
 * tags:
 *   name: Blast Control
 *   description: Advanced blast campaign control and safety features
 */

/**
 * @swagger
 * /blast-control/safety-limits:
 *   get:
 *     tags: [Blast Control]
 *     summary: Get safety limits
 *     description: Returns current safety limits and quotas for blast campaigns
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Safety limits configuration
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 dailyLimit:
 *                   type: integer
 *                 hourlyLimit:
 *                   type: integer
 *                 minDelay:
 *                   type: integer
 *                   description: Minimum delay between messages (ms)
 *                 maxDelay:
 *                   type: integer
 *                   description: Maximum delay between messages (ms)
 *                 currentUsage:
 *                   type: object
 *                   properties:
 *                     today:
 *                       type: integer
 *                     thisHour:
 *                       type: integer
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

/**
 * @swagger
 * /blast-control/auto-safety:
 *   post:
 *     tags: [Blast Control]
 *     summary: Configure auto-safety features
 *     description: Updates automatic safety mechanisms for blast campaigns
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               enabled:
 *                 type: boolean
 *               pauseOnHighRisk:
 *                 type: boolean
 *               adaptiveDelay:
 *                 type: boolean
 *                 description: Automatically adjust delay based on account health
 *               maxFailureRate:
 *                 type: number
 *                 format: float
 *                 description: Auto-pause if failure rate exceeds this (0-1)
 *                 example: 0.1
 *     responses:
 *       200:
 *         description: Auto-safety configured successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 config:
 *                   type: object
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

/**
 * @swagger
 * /blast-control/pause:
 *   post:
 *     tags: [Blast Control]
 *     summary: Emergency pause all campaigns
 *     description: Immediately pauses all running blast campaigns
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
 *                 example: "High failure rate detected"
 *     responses:
 *       200:
 *         description: Campaigns paused successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 pausedCampaigns:
 *                   type: integer
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

/**
 * @swagger
 * /blast-control/resume:
 *   post:
 *     tags: [Blast Control]
 *     summary: Resume paused campaigns
 *     description: Resumes previously paused blast campaigns
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               campaignIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Specific campaigns to resume (empty = all)
 *     responses:
 *       200:
 *         description: Campaigns resumed successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
