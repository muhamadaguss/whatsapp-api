const {
  getSock,
  waitForQRCode,
  startWhatsApp,
  getActiveSessionIds,
  cleanupSession,
  checkSessionExists,
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
  const userId = req.user?.id;

  // ✨ Check if session already exists with different userId
  const sessionCheck = await checkSessionExists(sessionId, userId);
  
  if (sessionCheck.conflict) {
    throw new AppError(sessionCheck.message, 409); // 409 Conflict
  }

  if (!getSock(sessionId)) {
    try {
      await startWhatsApp(sessionId, userId);
    } catch (error) {
      if (error.message.includes("sudah ada dengan userId berbeda")) {
        throw new AppError(error.message, 409); // 409 Conflict
      }
      throw error;
    }
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

  // Debug request details
  logger.info(`🔍 Request debug:`, {
    body: req.body,
    files: req.files,
    file: req.file,
    headers: req.headers["content-type"],
  });

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

  // Handle file uploads (image or video)
  const uploadedFile =
    req.files?.image?.[0] || req.files?.video?.[0] || req.file;

  // Debug logging
  logger.info(`📁 File upload debug:`, {
    messageType,
    hasReqFiles: !!req.files,
    hasReqFile: !!req.file,
    imageFiles: req.files?.image?.length || 0,
    videoFiles: req.files?.video?.length || 0,
    uploadedFile: !!uploadedFile,
  });

  if ((messageType === "image" || messageType === "video") && uploadedFile) {
    // Send media message with retry mechanism
    const mediaBuffer = fs.readFileSync(uploadedFile.path);
    const isVideo = messageType === "video";
    messageContent = `[${isVideo ? "Video" : "Image"}] ${message || ""}`;

    // Save media to permanent location first
    const extension = isVideo ? "mp4" : "jpg";
    const fileName = `sent_${Date.now()}_${Math.random()
      .toString(36)
      .substring(7)}.${extension}`;
    const permanentPath = path.join(__dirname, "../uploads", fileName);

    try {
      // Copy file to permanent location
      fs.copyFileSync(uploadedFile.path, permanentPath);
      mediaUrl = `/uploads/${fileName}`;
      logger.info(
        `📷 ${isVideo ? "Video" : "Image"} saved permanently: ${fileName}`
      );
    } catch (saveError) {
      logger.error(
        `❌ Failed to save ${isVideo ? "video" : "image"} permanently: ${
          saveError.message
        }`
      );
    }

    // Try to send media with retry
    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
      try {
        logger.info(
          `📷 Attempting to send ${isVideo ? "video" : "image"} (attempt ${
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

        if (isVideo) {
          result = await sock.sendMessage(phone + "@s.whatsapp.net", {
            video: mediaBuffer,
            caption: message || "", // Optional caption
          });
        } else {
          result = await sock.sendMessage(phone + "@s.whatsapp.net", {
            image: mediaBuffer,
            caption: message || "", // Optional caption
          });
        }

        logger.info(
          `✅ ${isVideo ? "Video" : "Image"} sent successfully on attempt ${
            retryCount + 1
          }`
        );
        break; // Success, exit retry loop
      } catch (sendError) {
        retryCount++;
        logger.error(
          `❌ ${
            isVideo ? "Video" : "Image"
          } send attempt ${retryCount} failed:`,
          {
            error: sendError.message,
            phone,
            sessionId,
            retryCount,
          }
        );

        if (retryCount >= maxRetries) {
          // All retries failed, throw the error
          throw new AppError(
            `Gagal mengirim ${
              isVideo ? "video" : "gambar"
            } setelah ${maxRetries} percobaan. Error: ${sendError.message}`,
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
            `Koneksi WhatsApp terputus selama pengiriman ${
              isVideo ? "video" : "gambar"
            }. Silakan coba lagi.`,
            503
          );
        }
      }
    }

    // Clean up temporary uploaded file
    try {
      fs.unlinkSync(uploadedFile.path);
    } catch (cleanupError) {
      logger.warn(
        `⚠️ Gagal hapus file ${isVideo ? "video" : "gambar"} temporary: ${
          cleanupError.message
        }`
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
  
  // ✨ NEW: Extract pagination parameters from query
  const { 
    limit = 10, 
    offset = 0, 
    search = '',
    sortBy = 'createdAt',
    sortOrder = 'DESC'
  } = req.query;

  // ✨ NEW: Build where clause with search functionality
  const { Op } = require('sequelize');
  const whereClause = { userId };
  
  // Add search functionality if search term provided
  if (search && search.trim() !== '') {
    whereClause[Op.or] = [
      { sessionId: { [Op.iLike]: `%${search.trim()}%` } },
      { phoneNumber: { [Op.iLike]: `%${search.trim()}%` } },
      { displayName: { [Op.iLike]: `%${search.trim()}%` } }
    ];
  }

  // ✨ NEW: Use findAndCountAll for pagination support
  const { count, rows: activeSessions } = await SessionModel.findAndCountAll({
    where: whereClause,
    include: [
      {
        model: UserModel,
        as: "user",
        attributes: ["id", "username", "role"], // ambil kolom yang diperlukan dari User
      },
    ],
    order: [[sortBy, sortOrder.toUpperCase()]],
    limit: parseInt(limit),
    offset: parseInt(offset)
  });

  // ✨ NEW: Enhanced response with pagination info
  return res.status(200).json({
    status: "success",
    data: {
      activeSessions,
      pagination: {
        total: count,
        limit: parseInt(limit),
        offset: parseInt(offset),
        totalPages: Math.ceil(count / parseInt(limit)),
        currentPage: Math.floor(parseInt(offset) / parseInt(limit)) + 1,
        hasMore: parseInt(offset) + parseInt(limit) < count
      }
    }
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
