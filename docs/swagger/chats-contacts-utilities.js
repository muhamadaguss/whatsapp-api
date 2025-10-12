/**
 * @swagger
 * tags:
 *   name: Chats
 *   description: Chat and conversation management
 */

/**
 * @swagger
 * /chats:
 *   get:
 *     tags: [Chats]
 *     summary: Get all chats
 *     description: Returns list of all WhatsApp chats/conversations
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: WhatsApp session ID
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: List of chats
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 chats:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       jid:
 *                         type: string
 *                       name:
 *                         type: string
 *                       lastMessage:
 *                         type: string
 *                       timestamp:
 *                         type: string
 *                         format: date-time
 *                       unreadCount:
 *                         type: integer
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

/**
 * @swagger
 * /chats/{jid}/messages:
 *   get:
 *     tags: [Chats]
 *     summary: Get chat messages
 *     description: Returns messages from a specific chat conversation
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: jid
 *         required: true
 *         schema:
 *           type: string
 *         description: WhatsApp JID
 *       - in: query
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: Chat messages
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 messages:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

/**
 * @swagger
 * tags:
 *   name: Contacts
 *   description: Contact management
 */

/**
 * @swagger
 * /contacts:
 *   get:
 *     tags: [Contacts]
 *     summary: Get all contacts
 *     description: Returns list of all WhatsApp contacts
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: WhatsApp session ID
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name or number
 *     responses:
 *       200:
 *         description: List of contacts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 contacts:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       jid:
 *                         type: string
 *                       name:
 *                         type: string
 *                       number:
 *                         type: string
 *                       profilePicture:
 *                         type: string
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

/**
 * @swagger
 * /contacts/sync:
 *   post:
 *     tags: [Contacts]
 *     summary: Sync contacts from WhatsApp
 *     description: Synchronizes contacts from WhatsApp to database
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
 *             properties:
 *               sessionId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Contacts synced successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

/**
 * @swagger
 * tags:
 *   name: User Management
 *   description: User and team member management
 */

/**
 * @swagger
 * /user/profile:
 *   get:
 *     tags: [User Management]
 *     summary: Get user profile
 *     description: Returns current user profile information
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                 username:
 *                   type: string
 *                 email:
 *                   type: string
 *                 organizationId:
 *                   type: string
 *                 roleInOrg:
 *                   type: string
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

/**
 * @swagger
 * /user/update:
 *   put:
 *     tags: [User Management]
 *     summary: Update user profile
 *     description: Updates current user profile
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *               email:
 *                 type: string
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

/**
 * @swagger
 * tags:
 *   name: Utilities
 *   description: Utility and helper endpoints
 */

/**
 * @swagger
 * /download/{filename}:
 *   get:
 *     tags: [Utilities]
 *     summary: Download file
 *     description: Downloads a file from server (media, reports, exports)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: filename
 *         required: true
 *         schema:
 *           type: string
 *         description: File name to download
 *     responses:
 *       200:
 *         description: File download
 *         content:
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: File not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

/**
 * @swagger
 * /cleanup/temp-files:
 *   post:
 *     tags: [Utilities]
 *     summary: Cleanup temporary files
 *     description: Removes old temporary files from server
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: olderThanDays
 *         schema:
 *           type: integer
 *           default: 7
 *         description: Remove files older than specified days
 *     responses:
 *       200:
 *         description: Cleanup completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 filesDeleted:
 *                   type: integer
 *                 spaceFree:
 *                   type: string
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

/**
 * @swagger
 * /menus:
 *   get:
 *     tags: [Utilities]
 *     summary: Get navigation menus
 *     description: Returns navigation menu structure based on user role
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Menu structure
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 menus:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       label:
 *                         type: string
 *                       icon:
 *                         type: string
 *                       path:
 *                         type: string
 *                       children:
 *                         type: array
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

/**
 * @swagger
 * /spin-text/generate:
 *   post:
 *     tags: [Utilities]
 *     summary: Generate spin text variations
 *     description: Generates multiple text variations from spin syntax for bulk messages
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - text
 *             properties:
 *               text:
 *                 type: string
 *                 example: "{Hello|Hi|Hey} {John|friend}!"
 *               count:
 *                 type: integer
 *                 example: 10
 *                 description: Number of variations to generate
 *     responses:
 *       200:
 *         description: Text variations generated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 variations:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["Hello John!", "Hi friend!", "Hey John!"]
 *       400:
 *         description: Invalid spin syntax
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

/**
 * @swagger
 * /classifier/analyze:
 *   post:
 *     tags: [Utilities]
 *     summary: Analyze message content
 *     description: Classifies message content for spam detection, sentiment analysis
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *                 example: "Special discount 50% OFF! Buy now!"
 *     responses:
 *       200:
 *         description: Message analysis result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 isSpam:
 *                   type: boolean
 *                 spamScore:
 *                   type: number
 *                   format: float
 *                 sentiment:
 *                   type: string
 *                   enum: [positive, neutral, negative]
 *                 categories:
 *                   type: array
 *                   items:
 *                     type: string
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
