/**
 * @swagger
 * tags:
 *   name: Templates
 *   description: Message template management
 */

const express = require('express');
const { verifyToken } = require('../middleware/authMiddleware');
const { tenantContext } = require('../middleware/tenantContext');
const { withTenantContext } = require('../middleware/tenantIsolation');
const quotaService = require('../services/quotaService');
const { getTemplates, createTemplate, updateTemplate, deleteTemplate } = require('../controllers/templateController');
const router = express.Router();

/**
 * @swagger
 * /templates:
 *   get:
 *     tags: [Templates]
 *     summary: Get all message templates
 *     description: Returns list of all message templates for current organization
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of templates
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 templates:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       name:
 *                         type: string
 *                       content:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/', verifyToken, tenantContext, withTenantContext, getTemplates);

/**
 * @swagger
 * /templates:
 *   post:
 *     tags: [Templates]
 *     summary: Create new message template
 *     description: Creates a new message template. Requires template quota.
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
 *               - content
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Welcome Message"
 *               content:
 *                 type: string
 *                 example: "Hello {{name}}, welcome to our service!"
 *               variables:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["name"]
 *     responses:
 *       201:
 *         description: Template created successfully
 *       403:
 *         description: Template quota exceeded
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post('/', verifyToken, tenantContext, withTenantContext, quotaService.requireQuota('templates', 1), createTemplate);

/**
 * @swagger
 * /templates:
 *   put:
 *     tags: [Templates]
 *     summary: Update message template
 *     description: Updates an existing message template
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - id
 *             properties:
 *               id:
 *                 type: integer
 *                 example: 1
 *               name:
 *                 type: string
 *                 example: "Updated Welcome Message"
 *               content:
 *                 type: string
 *                 example: "Hi {{name}}, thanks for joining!"
 *     responses:
 *       200:
 *         description: Template updated successfully
 *       404:
 *         description: Template not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.put('/', verifyToken, tenantContext, withTenantContext, updateTemplate);

/**
 * @swagger
 * /templates:
 *   delete:
 *     tags: [Templates]
 *     summary: Delete message template
 *     description: Deletes a message template by ID
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - id
 *             properties:
 *               id:
 *                 type: integer
 *                 example: 1
 *     responses:
 *       200:
 *         description: Template deleted successfully
 *       404:
 *         description: Template not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.delete('/', verifyToken, tenantContext, withTenantContext, deleteTemplate);

module.exports = router;