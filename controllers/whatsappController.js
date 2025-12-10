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
  const sessionCheck = await checkSessionExists(sessionId, userId);
  if (sessionCheck.conflict) {
    throw new AppError(sessionCheck.message, 409); 
  }
  if (!getSock(sessionId)) {
    try {
      await startWhatsApp(sessionId, userId);
    } catch (error) {
      if (error.message.includes("sudah ada dengan userId berbeda")) {
        throw new AppError(error.message, 409); 
      }
      throw error;
    }
  }
  const qrData = await waitForQRCode(sessionId);
  if (qrData) {
    const base64 = qrData.replace(/^data:image\/png;base64,/, "");
    return res.status(200).json({
      status: "success",
      qrCode: base64, 
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
  const health = checkSessionHealth(sock, sessionId, true);
  logger.info(`🔍 Session health check for ${sessionId}:`, {
    isHealthy: health.isHealthy,
    issues: health.issues,
    websocketState: health.details.websocketState,
    userAuthenticated: health.details.userAuthenticated,
  });
  if (!health.isHealthy) {
    logSessionHealth(sock, sessionId);
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
      logger.warn(
        `⚠️ Session ${sessionId} has minor issues: ${health.issues.join(", ")}`
      );
    }
  }
  let result;
  let messageContent = message;
  let mediaUrl = null;
  const uploadedFile =
    req.files?.image?.[0] || req.files?.video?.[0] || req.file;
  logger.info(`📁 File upload debug:`, {
    messageType,
    hasReqFiles: !!req.files,
    hasReqFile: !!req.file,
    imageFiles: req.files?.image?.length || 0,
    videoFiles: req.files?.video?.length || 0,
    uploadedFile: !!uploadedFile,
  });
  if ((messageType === "image" || messageType === "video") && uploadedFile) {
    const mediaBuffer = fs.readFileSync(uploadedFile.path);
    const isVideo = messageType === "video";
    messageContent = `[${isVideo ? "Video" : "Image"}] ${message || ""}`;
    const extension = isVideo ? "mp4" : "jpg";
    const fileName = `sent_${Date.now()}_${Math.random()
      .toString(36)
      .substring(7)}.${extension}`;
    const permanentPath = path.join(__dirname, "../uploads", fileName);
    try {
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
    let retryCount = 0;
    const maxRetries = 3;
    while (retryCount < maxRetries) {
      try {
        logger.info(
          `📷 Attempting to send ${isVideo ? "video" : "image"} (attempt ${
            retryCount + 1
          }/${maxRetries})`
        );
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
            caption: message || "", 
          });
        } else {
          result = await sock.sendMessage(phone + "@s.whatsapp.net", {
            image: mediaBuffer,
            caption: message || "", 
          });
        }
        logger.info(
          `✅ ${isVideo ? "Video" : "Image"} sent successfully on attempt ${
            retryCount + 1
          }`
        );
        break; 
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
          throw new AppError(
            `Gagal mengirim ${
              isVideo ? "video" : "gambar"
            } setelah ${maxRetries} percobaan. Error: ${sendError.message}`,
            500
          );
        }
        const waitTime = Math.pow(2, retryCount) * 1000; 
        logger.info(`⏳ Waiting ${waitTime}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
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
    let retryCount = 0;
    const maxRetries = 3;
    while (retryCount < maxRetries) {
      try {
        logger.info(
          `📨 Attempting to send text message (attempt ${
            retryCount + 1
          }/${maxRetries})`
        );
        if (
          sock.ws &&
          sock.ws.readyState !== 1 &&
          sock.ws.readyState !== undefined
        ) {
          throw new Error(`WebSocket not ready (state: ${sock.ws.readyState})`);
        }
        result = await sock.sendMessage(phone + "@s.whatsapp.net", {
          text: message,
        });
        logger.info(`✅ Text message sent successfully on attempt ${retryCount + 1}`);
        break; 
      } catch (sendError) {
        retryCount++;
        logger.error(`❌ Text message send attempt ${retryCount} failed:`, {
          error: sendError.message,
          phone,
          sessionId,
          retryCount,
        });
        if (retryCount >= maxRetries) {
          throw new AppError(
            `Gagal mengirim pesan teks setelah ${maxRetries} percobaan. Error: ${sendError.message}`,
            500
          );
        }
        const waitTime = Math.pow(2, retryCount) * 1000; 
        logger.info(`⏳ Waiting ${waitTime}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        if (sock.ws && sock.ws.readyState !== 1) {
          throw new AppError(
            `Koneksi WhatsApp terputus selama pengiriman pesan. Silakan coba lagi.`,
            503
          );
        }
      }
    }
  }
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
  }
  try {
    const ChatMessageModel = require("../models/chatModel");
    const messageData = {
      messageId: result.key.id, 
      sessionId,
      from: phone + "@s.whatsapp.net",
      contactName: phone,
      text: messageContent,
      messageType: messageType || "text",
      mediaUrl: mediaUrl,
      timestamp: new Date(),
      fromMe: true,
      isRead: true,
    };
    const [chatMessage, created] = await ChatMessageModel.upsert(messageData, {
      returning: true,
      conflictFields: ['messageId']
    });
    if (created) {
      logger.info(`💾 New chat message saved for sent message to ${phone}`);
    } else {
      logger.info(`🔄 Chat message already exists for messageId: ${result.key.id}`);
    }
  } catch (chatDbError) {
    logger.error(`❌ Failed to save chat message:`, {
      error: chatDbError.message,
      messageId: result.key.id,
      phone,
      sessionId,
    });
  }
  return res.status(200).json({ status: "success", result });
});
const uploadExcel = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const messageTemplate = req.body.messageTemplate || "";
  const notifyNumber = req.body.notifyNumber?.replace(/\D/g, "");
  const selectTarget = req.body.selectTarget;
  const inputNumbers = req.body.inputNumbers;
  const filePath = req.file?.path; 
  if (selectTarget !== "input" && !filePath) {
    throw new AppError(
      "File tidak ditemukan. Silakan upload file Excel atau gunakan input manual.",
      400
    );
  }
  res.json({ status: "processing", message: "Blast dimulai di background" });
  logger.info("🔄 Memproses blast...");
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
    await sock.logout(); 
    logger.info(`🔌 Logout session ${sessionId} berhasil.`);
  } else {
    logger.warn(`⚠️ Session ${sessionId} sudah tidak aktif atau undefined.`);
  }
  cleanupSession(sessionId, req.user?.id); 
  return res.status(200).json({
    status: "success",
    message: `Logout session ${sessionId} berhasil.`,
  });
});
const getActiveSessions = asyncHandler(async (req, res) => {
  const userId = req.user.id; 
  const { 
    limit, 
    offset = 0, 
    search = '',
    sortBy = 'createdAt',
    sortOrder = 'DESC'
  } = req.query;
  const { Op } = require('sequelize');
  const whereClause = { userId };
  if (search && search.trim() !== '') {
    whereClause[Op.or] = [
      { sessionId: { [Op.iLike]: `%${search.trim()}%` } },
      { phoneNumber: { [Op.iLike]: `%${search.trim()}%` } },
      { displayName: { [Op.iLike]: `%${search.trim()}%` } }
    ];
  }
  const queryOptions = {
    where: whereClause,
    include: [
      {
        model: UserModel,
        as: "user",
        attributes: ["id", "username", "role"], 
      },
    ],
    order: [[sortBy, sortOrder.toUpperCase()]],
  };
  if (limit && parseInt(limit) > 0) {
    queryOptions.limit = parseInt(limit);
    queryOptions.offset = parseInt(offset);
  } 
  const { count, rows: activeSessions } = await SessionModel.findAndCountAll(queryOptions);
  return res.status(200).json({
    status: "success",
    data: {
      activeSessions,
      pagination: limit && parseInt(limit) > 0 ? {
        total: count,
        limit: parseInt(limit),
        offset: parseInt(offset),
        totalPages: Math.ceil(count / parseInt(limit)),
        currentPage: Math.floor(parseInt(offset) / parseInt(limit)) + 1,
        hasMore: parseInt(offset) + parseInt(limit) < count
      } : null, 
    },
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
