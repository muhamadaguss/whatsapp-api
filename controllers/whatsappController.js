const {
  getSock,
  waitForQRCode,
  startWhatsApp,
  getActiveSessionIds,
  cleanupSession,
} = require("../auth/session");
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
  const { phone, message, sessionId } = req.body;
  logger.info(
    `📞 Mengirim pesan ke: ${phone}, dengan pesan: ${message}, pada session: ${sessionId}`
  );

  if (!phone || !message || !sessionId) {
    throw new AppError("Nomor, pesan, dan sessionId wajib.", 400);
  }

  const sock = getSock(sessionId);
  if (!sock) {
    throw new AppError(
      `Session '${sessionId}' tidak ditemukan atau tidak aktif.`,
      404
    );
  }

  const result = await sock.sendMessage(phone + "@s.whatsapp.net", {
    text: message,
  });

  // Save message status to database
  try {
    const MessageStatusModel = require("../models/messageStatusModel");
    await MessageStatusModel.upsert({
      messageId: result.key.id,
      phone: phone.replace(/\D/g, ""),
      status: "sent",
      userId: req.user?.id,
      sessionId,
      message,
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

module.exports = {
  getQRImage,
  sendMessageWA,
  uploadExcel,
  logoutSession,
  getActiveSessions,
};
