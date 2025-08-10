const {
  getSock,
  waitForQRCode,
  startWhatsApp,
  getActiveSessionIds,
  cleanupSession,
} = require("../auth/session");
const {
  checkSessionHealth,
  logSessionHealth,
} = require("../utils/connectionHealth");
const path = require("path");
const { processExcelAndSendMessages } = require("../services/excelService");
const fs = require("fs");
const logger = require("../utils/logger");
const SessionModel = require("../models/sessionModel");
const UserModel = require("../models/userModel");
const { asyncHandler, AppError } = require("../middleware/errorHandler");

const getQRImage = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;

  if (!getSock(sessionId)) {
    await startWhatsApp(sessionId, req.user?.id); // QR akan otomatis ter-generate
  }

  const qrData = await waitForQRCode(sessionId);
  if (qrData) {
    const base64 = qrData.replace(/^data:image\/png;base64,/, "");
    return res.status(200).json({
      status: "success",
      qrCode: base64, // Mengembalikan QR code dalam bentuk base64
    });
  } else {
    throw new AppError("QR belum tersedia", 404);
  }
});

const sendMessageWA = asyncHandler(async (req, res) => {
  const { phone, message, sessionId, messageType = "text" } = req.body;
  logger.info(
    `📞 Mengirim pesan ke: ${phone}, dengan pesan: ${message}, pada session: ${sessionId}, type: ${messageType}`
  );

  if (!phone || !sessionId) {
    throw new AppError("Nomor dan sessionId wajib.", 400);
  }

  if (messageType === "text" && !message) {
    throw new AppError("Pesan teks wajib diisi.", 400);
  }

  const sock = getSock(sessionId);
  if (!sock) {
    throw new AppError(
      `Session '${sessionId}' tidak ditemukan atau tidak aktif.`,
      404
    );
  }

  // Check session health (use permissive mode for better compatibility)
  const health = checkSessionHealth(sock, sessionId, true);
  if (!health.isHealthy) {
    logSessionHealth(sock, sessionId);

    // Provide more specific error messages
    const criticalIssues = health.issues.filter(
      (issue) =>
        issue.includes("closed") ||
        issue.includes("not authenticated") ||
        issue.includes("not available")
    );

    if (criticalIssues.length > 0) {
      throw new AppError(
        `Session '${sessionId}' tidak dapat digunakan: ${criticalIssues.join(
          ", "
        )}. Silakan reconnect session.`,
        503
      );
    } else {
      // Non-critical issues, log warning but allow to proceed
      logger.warn(
        `⚠️ Session ${sessionId} has minor issues: ${health.issues.join(", ")}`
      );
    }
  }

  let result;
  let messageContent = message;
  let mediaUrl = null;

  if (messageType === "image" && req.file) {
    // Send image message with retry mechanism
    const imageBuffer = fs.readFileSync(req.file.path);
    messageContent = `[Image] ${message || ""}`;

    // Save image to permanent location first
    const fileName = `sent_${Date.now()}_${Math.random()
      .toString(36)
      .substring(7)}.jpg`;
    const permanentPath = path.join(__dirname, "../uploads", fileName);

    try {
      // Copy file to permanent location
      fs.copyFileSync(req.file.path, permanentPath);
      mediaUrl = `/uploads/${fileName}`;
      logger.info(`📷 Image saved permanently: ${fileName}`);
    } catch (saveError) {
      logger.error(`❌ Failed to save image permanently: ${saveError.message}`);
    }

    // Try to send image with retry
    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
      try {
        logger.info(
          `📷 Attempting to send image (attempt ${
            retryCount + 1
          }/${maxRetries})`
        );

        // Double-check connection before sending
        if (
          sock.ws &&
          sock.ws.readyState !== 1 &&
          sock.ws.readyState !== undefined
        ) {
          throw new Error(`WebSocket not ready (state: ${sock.ws.readyState})`);
        }

        result = await sock.sendMessage(phone + "@s.whatsapp.net", {
          image: imageBuffer,
          caption: message || "", // Optional caption
        });

        logger.info(`✅ Image sent successfully on attempt ${retryCount + 1}`);
        break; // Success, exit retry loop
      } catch (sendError) {
        retryCount++;
        logger.error(`❌ Image send attempt ${retryCount} failed:`, {
          error: sendError.message,
          phone,
          sessionId,
          retryCount,
        });

        if (retryCount >= maxRetries) {
          // All retries failed, throw the error
          throw new AppError(
            `Gagal mengirim gambar setelah ${maxRetries} percobaan. Error: ${sendError.message}`,
            500
          );
        }

        // Wait before retry (exponential backoff)
        const waitTime = Math.pow(2, retryCount) * 1000; // 2s, 4s, 8s
        logger.info(`⏳ Waiting ${waitTime}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));

        // Check connection again before retry
        if (sock.ws && sock.ws.readyState !== 1) {
          throw new AppError(
            `Koneksi WhatsApp terputus selama pengiriman gambar. Silakan coba lagi.`,
            503
          );
        }
      }
    }

    // Clean up temporary uploaded file
    try {
      fs.unlinkSync(req.file.path);
    } catch (cleanupError) {
      logger.warn(
        `⚠️ Gagal hapus file gambar temporary: ${cleanupError.message}`
      );
    }
  } else {
    // Send text message
    result = await sock.sendMessage(phone + "@s.whatsapp.net", {
      text: message,
    });
  }

  // Save message status to database
  try {
    const MessageStatusModel = require("../models/messageStatusModel");
    await MessageStatusModel.upsert({
      messageId: result.key.id,
      phone: phone.replace(/\D/g, ""),
      status: "sent",
      userId: req.user?.id,
      sessionId,
      message: messageContent,
      deliveredAt: new Date(),
      readAt: null,
    });
    logger.info(`💾 Status pesan disimpan ke database untuk ${phone}`);
  } catch (dbError) {
    logger.error(`❌ Gagal simpan status ke database untuk ${phone}:`, {
      error: dbError.message,
      messageId: result.key.id,
      phone,
      userId: req.user?.id,
      sessionId,
    });
    // Jangan throw error, response tetap success
  }

  // Also save to chat messages for consistency
  try {
    const ChatMessageModel = require("../models/chatModel");
    await ChatMessageModel.create({
      sessionId,
      from: phone + "@s.whatsapp.net",
      contactName: phone,
      text: messageContent,
      messageType: messageType || "text",
      mediaUrl: mediaUrl,
      timestamp: new Date(),
      fromMe: true,
      isRead: true,
    });
    logger.info(`💾 Chat message saved for sent message to ${phone}`);
  } catch (chatDbError) {
    logger.error(`❌ Failed to save chat message:`, chatDbError.message);
  }

  return res.status(200).json({ status: "success", result });
});

const uploadExcel = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const messageTemplate = req.body.messageTemplate || "";
  const notifyNumber = req.body.notifyNumber?.replace(/\D/g, "");
  const selectTarget = req.body.selectTarget;
  const inputNumbers = req.body.inputNumbers;
  const filePath = req.file?.path; // Gunakan optional chaining di sini

  // Validasi awal
  if (selectTarget !== "input" && !filePath) {
    throw new AppError(
      "File tidak ditemukan. Silakan upload file Excel atau gunakan input manual.",
      400
    );
  }

  // Langsung balas ke client
  res.json({ status: "processing", message: "Blast dimulai di background" });
  logger.info("🔄 Memproses blast...");

  // Proses jalan di background dengan proper error handling
  processExcelAndSendMessages(
    filePath,
    sessionId,
    messageTemplate,
    notifyNumber,
    req.user?.id,
    selectTarget,
    inputNumbers
  )
    .then((results) => {
      logger.info("✅ Blast selesai:", results?.length || 0, "pesan diproses");
    })
    .catch((err) => {
      logger.error("❌ Error saat blast:", {
        message: err?.message || "Unknown error",
        stack: err?.stack || "No stack trace",
        sessionId,
        userId: req.user?.id,
        error: err,
      });
    })
    .finally(() => {
      // Cleanup jika diperlukan
      if (filePath) {
        try {
          const fs = require("fs");
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            logger.info("🗑️ File temporary dihapus:", filePath);
          }
        } catch (cleanupErr) {
          logger.warn("⚠️ Gagal hapus file temporary:", cleanupErr.message);
        }
      }
    });
});

const logoutSession = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;

  const sock = getSock(sessionId);

  if (sock) {
    await sock.logout(); // Jika masih aktif
    logger.info(`🔌 Logout session ${sessionId} berhasil.`);
  } else {
    logger.warn(`⚠️ Session ${sessionId} sudah tidak aktif atau undefined.`);
  }

  cleanupSession(sessionId, req.user?.id); // Hapus session dari memori

  return res.status(200).json({
    status: "success",
    message: `Logout session ${sessionId} berhasil.`,
  });
});

const getActiveSessions = asyncHandler(async (req, res) => {
  const userId = req.user.id; // pastikan middleware auth sudah pasang req.user

  const activeSessions = await SessionModel.findAll({
    where: { userId }, // filter hanya session milik user login
    include: [
      {
        model: UserModel,
        as: "user",
        attributes: ["id", "username", "role"], // ambil kolom yang diperlukan dari User
      },
    ],
  });

  return res.status(200).json({
    status: "success",
    activeSessions,
  });
});

const getContactDetails = asyncHandler(async (req, res) => {
  const { sessionId, jid } = req.params;

  const sock = getSock(sessionId);
  if (!sock) {
    throw new AppError(
      `Session '${sessionId}' tidak ditemukan atau tidak aktif.`,
      404
    );
  }

  // Import the getContactDetails function from session.js
  const {
    getContactDetails: getContactDetailsFromSession,
  } = require("../auth/session");

  try {
    const contactDetails = await getContactDetailsFromSession(sock, jid);

    return res.status(200).json({
      status: "success",
      data: contactDetails,
    });
  } catch (error) {
    logger.error(`❌ Error getting contact details for ${jid}:`, error.message);
    throw new AppError("Gagal mengambil detail kontak", 500);
  }
});

const getSessionHealth = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;

  const sock = getSock(sessionId);
  if (!sock) {
    throw new AppError(
      `Session '${sessionId}' tidak ditemukan atau tidak aktif.`,
      404
    );
  }

  const health = checkSessionHealth(sock, sessionId);

  return res.status(200).json({
    status: "success",
    data: {
      sessionId,
      isHealthy: health.isHealthy,
      issues: health.issues,
      details: health.details,
      timestamp: new Date().toISOString(),
    },
  });
});

module.exports = {
  getQRImage,
  sendMessageWA,
  uploadExcel,
  logoutSession,
  getActiveSessions,
  getContactDetails,
  getSessionHealth,
};
