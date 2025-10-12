/**
 * @swagger
 * tags:
 *   name: WhatsApp
 *   description: WhatsApp session management and messaging endpoints
 */

const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const { verifyToken } = require("../middleware/authMiddleware");
const { tenantContext } = require("../middleware/tenantContext");
const { withTenantContext } = require("../middleware/tenantIsolation");
const quotaService = require("../services/quotaService");
const {
  getQRImage,
  sendMessageWA,
  uploadExcel,
  logoutSession,
  getActiveSessions,
  getContactDetails,
  getSessionHealth,
} = require("../controllers/whatsappController");

const {
  getAccountMetadata,
  updateAccountCreationDate,
} = require("../controllers/accountMetadataController");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/"); // pastikan folder ini ada
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

// Configure multer for different file types
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    // Allow images for chat messages
    if (file.fieldname === "image") {
      if (file.mimetype.startsWith("image/")) {
        cb(null, true);
      } else {
        cb(new Error("Only image files are allowed for image messages"), false);
      }
    } else if (file.fieldname === "video") {
      // Allow videos for chat messages
      if (file.mimetype.startsWith("video/")) {
        cb(null, true);
      } else {
        cb(new Error("Only video files are allowed for video messages"), false);
      }
    } else {
      // Allow excel files for blast messages
      cb(null, true);
    }
  },
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit for videos
  },
});

/**
 * @swagger
 * /whatsapp/qr-image/{sessionId}:
 *   get:
 *     tags: [WhatsApp]
 *     summary: Get QR code for WhatsApp session pairing
 *     description: Returns QR code image for scanning with WhatsApp mobile app to initialize session
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Unique session identifier
 *         example: my-whatsapp-session
 *     responses:
 *       200:
 *         description: QR code image returned
 *         content:
 *           image/png:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Session not found or QR not available
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get("/qr-image/:sessionId", verifyToken, tenantContext, withTenantContext, getQRImage);

/**
 * @swagger
 * /whatsapp/send-message:
 *   post:
 *     tags: [WhatsApp]
 *     summary: Send WhatsApp message
 *     description: Send text, image, or video message via WhatsApp. Requires active session and available message quota.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - sessionId
 *               - number
 *             properties:
 *               sessionId:
 *                 type: string
 *                 description: WhatsApp session ID
 *                 example: my-session
 *               number:
 *                 type: string
 *                 description: Phone number with country code (no + sign)
 *                 example: "6281234567890"
 *               message:
 *                 type: string
 *                 description: Text message content
 *                 example: "Hello from WhatsApp API!"
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Image file to send
 *               video:
 *                 type: string
 *                 format: binary
 *                 description: Video file to send
 *     responses:
 *       200:
 *         description: Message sent successfully
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
 *                   example: Message sent successfully
 *                 messageId:
 *                   type: string
 *       403:
 *         description: Quota exceeded
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
// Send message - check quota before allowing
router.post(
  "/send-message",
  verifyToken,
  tenantContext,
  withTenantContext,
  quotaService.requireQuota("messages_sent", 1),
  upload.fields([{ name: "image" }, { name: "video" }]),
  sendMessageWA
);

/**
 * @swagger
 * /whatsapp/upload/{sessionId}:
 *   post:
 *     tags: [WhatsApp]
 *     summary: Upload Excel for bulk blast campaign
 *     description: Upload Excel file with contacts and messages for bulk WhatsApp blast. Requires blast campaign quota.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: WhatsApp session ID
 *         example: my-session
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - excel
 *             properties:
 *               excel:
 *                 type: string
 *                 format: binary
 *                 description: Excel file (.xlsx) with columns - Phone, Message, Image (optional)
 *     responses:
 *       200:
 *         description: Blast campaign started successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 totalContacts:
 *                   type: integer
 *                 sessionId:
 *                   type: string
 *       403:
 *         description: Quota exceeded
 *       400:
 *         description: Invalid Excel format
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
// Upload Excel for blast - check quota (this will send multiple messages)
router.post(
  "/upload/:sessionId",
  verifyToken,
  tenantContext,
  withTenantContext,
  quotaService.requireQuota("blast_campaigns", 1),
  upload.single("excel"),
  uploadExcel
);

/**
 * @swagger
 * /whatsapp/logoutSession/{sessionId}:
 *   post:
 *     tags: [WhatsApp]
 *     summary: Logout and disconnect WhatsApp session
 *     description: Terminates the WhatsApp session and removes credentials
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: WhatsApp session ID to logout
 *     responses:
 *       200:
 *         description: Session logged out successfully
 *       404:
 *         description: Session not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post("/logoutSession/:sessionId", verifyToken, tenantContext, withTenantContext, logoutSession);

/**
 * @swagger
 * /whatsapp/sessions:
 *   get:
 *     tags: [WhatsApp]
 *     summary: Get all active WhatsApp sessions
 *     description: Returns list of all active WhatsApp sessions for the current organization
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of active sessions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 sessions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       sessionId:
 *                         type: string
 *                       status:
 *                         type: string
 *                         enum: [connected, disconnected, connecting]
 *                       phoneNumber:
 *                         type: string
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get("/sessions", verifyToken, tenantContext, withTenantContext, getActiveSessions);

/**
 * @swagger
 * /whatsapp/contact-details/{sessionId}/{jid}:
 *   get:
 *     tags: [WhatsApp]
 *     summary: Get WhatsApp contact details
 *     description: Retrieves detailed information about a WhatsApp contact
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: WhatsApp session ID
 *       - in: path
 *         name: jid
 *         required: true
 *         schema:
 *           type: string
 *         description: WhatsApp JID (e.g., 6281234567890@s.whatsapp.net)
 *     responses:
 *       200:
 *         description: Contact details retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 name:
 *                   type: string
 *                 number:
 *                   type: string
 *                 profilePicture:
 *                   type: string
 *       404:
 *         description: Contact not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get("/contact-details/:sessionId/:jid", verifyToken, tenantContext, withTenantContext, getContactDetails);

/**
 * @swagger
 * /whatsapp/health/{sessionId}:
 *   get:
 *     tags: [WhatsApp]
 *     summary: Get WhatsApp session health status
 *     description: Returns health metrics and connection status of WhatsApp session
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: WhatsApp session ID
 *     responses:
 *       200:
 *         description: Session health status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sessionId:
 *                   type: string
 *                 isConnected:
 *                   type: boolean
 *                 lastSeen:
 *                   type: string
 *                   format: date-time
 *                 messagesSent:
 *                   type: integer
 *                 messagesReceived:
 *                   type: integer
 *       404:
 *         description: Session not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get("/health/:sessionId", verifyToken, tenantContext, withTenantContext, getSessionHealth);

/**
 * @swagger
 * /whatsapp/account/{sessionId}/metadata:
 *   get:
 *     tags: [WhatsApp]
 *     summary: Get WhatsApp account metadata
 *     description: Retrieves account metadata including creation date, phone number, business details
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: WhatsApp session ID
 *     responses:
 *       200:
 *         description: Account metadata retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 phoneNumber:
 *                   type: string
 *                 creationDate:
 *                   type: string
 *                   format: date
 *                 businessName:
 *                   type: string
 *                 verified:
 *                   type: boolean
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
// Account metadata routes (Baileys → Database priority)
router.get("/account/:sessionId/metadata", verifyToken, getAccountMetadata);

/**
 * @swagger
 * /whatsapp/account/{sessionId}/creation-date:
 *   post:
 *     tags: [WhatsApp]
 *     summary: Update WhatsApp account creation date
 *     description: Manually update the account creation date in database
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: WhatsApp session ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - creationDate
 *             properties:
 *               creationDate:
 *                 type: string
 *                 format: date
 *                 example: "2024-01-15"
 *     responses:
 *       200:
 *         description: Creation date updated successfully
 *       400:
 *         description: Invalid date format
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post("/account/:sessionId/creation-date", verifyToken, updateAccountCreationDate);

module.exports = router;
