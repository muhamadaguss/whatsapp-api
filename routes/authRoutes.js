// /api/routes/auth.routes.js
const express = require('express')
const router = express.Router()
const {
    login,
    register,
    verify,
    hashPassword,
    logout
} = require('../controllers/authController')
const { verifyToken } = require('../middleware/authMiddleware')

/**
 * @swagger
 * /auth/login:
 *   post:
 *     tags: [Authentication]
 *     summary: User login
 *     description: Authenticate user and get JWT token with organization context
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: admin@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: password123
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 token:
 *                   type: string
 *                   example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     name:
 *                       type: string
 *                       example: Admin User
 *                     email:
 *                       type: string
 *                       example: admin@example.com
 *                     organizationId:
 *                       type: string
 *                       format: uuid
 *                     roleInOrg:
 *                       type: string
 *                       enum: [owner, admin, member]
 *                       example: owner
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/login', login)

/**
 * @swagger
 * /auth/register:
 *   post:
 *     tags: [Authentication]
 *     summary: Register new user
 *     description: Create new user account and organization (owner becomes first user)
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - password
 *               - organizationName
 *             properties:
 *               name:
 *                 type: string
 *                 example: John Doe
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *                 example: password123
 *               organizationName:
 *                 type: string
 *                 example: Acme Corporation
 *     responses:
 *       201:
 *         description: User and organization created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: User registered successfully
 *                 token:
 *                   type: string
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *                 organization:
 *                   $ref: '#/components/schemas/Organization'
 *       400:
 *         description: Invalid input or email already exists
 */
router.post('/register', register)

/**
 * @swagger
 * /auth/verify:
 *   get:
 *     tags: [Authentication]
 *     summary: Verify JWT token
 *     description: Validate current JWT token and return user info
 *     responses:
 *       200:
 *         description: Token is valid
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 valid:
 *                   type: boolean
 *                   example: true
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/verify', verifyToken, verify)

/**
 * @swagger
 * /auth/hash-password:
 *   post:
 *     tags: [Authentication]
 *     summary: Hash password (utility)
 *     description: Utility endpoint to hash a password (for testing/migration)
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *             properties:
 *               password:
 *                 type: string
 *                 example: mypassword123
 *     responses:
 *       200:
 *         description: Password hashed successfully
 */
router.post('/hash-password',hashPassword)

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     tags: [Authentication]
 *     summary: Logout user
 *     description: Blacklist current JWT token to prevent further use
 *     responses:
 *       200:
 *         description: Logged out successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Logged out successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post('/logout',verifyToken,logout)

module.exports = router
