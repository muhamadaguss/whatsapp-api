const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
} = require("@whiskeysockets/baileys");
const SessionModel = require("../models/sessionModel");
const MessageStatusModel = require("../models/messageStatusModel");
const ChatMessageModel = require("../models/chatModel");
const logger = require("../utils/logger");
const { getSocket } = require("./socket");

const sessions = {}; // sessionId => { sock, qr }
const qrWaiters = {}; // sessionId => [resolveFn1, resolveFn2, ...]

const statusPriority = {
  sent: 1,
  delivered: 2,
  read: 3,
};

// Helper function to get readable status code description
function getStatusCodeDescription(statusCode) {
  const statusDescriptions = {
    [DisconnectReason.connectionClosed]: "Koneksi ditutup",
    [DisconnectReason.connectionLost]: "Koneksi terputus",
    [DisconnectReason.connectionReplaced]:
      "Koneksi digantikan oleh perangkat lain",
    [DisconnectReason.timedOut]: "Koneksi timeout",
    [DisconnectReason.restartRequired]: "Perlu restart",
    [DisconnectReason.unavailableService]: "Layanan tidak tersedia",
    [DisconnectReason.loggedOut]: "Logout dari WhatsApp",
    [DisconnectReason.badSession]: "Sesi tidak valid",
    [DisconnectReason.multideviceMismatch]: "Ketidakcocokan multi-device",
    [DisconnectReason.forbidden]: "Akses ditolak/diblokir",
  };

  const description = statusDescriptions[statusCode];
  return description
    ? `${statusCode} (${description})`
    : `${statusCode} (Status tidak dikenal)`;
}

// Helper function to ensure sessions directory exists with proper permissions
function ensureSessionsDirectory() {
  const sessionsDir = path.resolve("./sessions");
  try {
    if (!fs.existsSync(sessionsDir)) {
      fs.mkdirSync(sessionsDir, { recursive: true, mode: 0o755 });
      logger.info(`📁 Created sessions directory: ${sessionsDir}`);
    }
  } catch (err) {
    logger.error(`❌ Failed to create sessions directory:`, err.message);
  }
}

// Helper function to check if we can write to a directory
function canWriteToDirectory(dirPath) {
  try {
    fs.accessSync(dirPath, fs.constants.W_OK);
    return true;
  } catch (err) {
    return false;
  }
}

async function startWhatsApp(sessionId, userId = null) {
  const io = getSocket();

  // Ensure sessions directory exists
  ensureSessionsDirectory();

  const sessionFolder = path.resolve(`./sessions/${sessionId}`);

  // Check if we can write to sessions directory
  const sessionsDir = path.resolve("./sessions");
  if (!canWriteToDirectory(sessionsDir)) {
    logger.warn(`⚠️ Cannot write to sessions directory: ${sessionsDir}`);
  }

  // Reuse active session if already connected
  const existingSession = sessions[sessionId];
  if (existingSession?.sock?.user) {
    logger.info(`🔁 Session ${sessionId} sudah aktif`);
    return;
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);
  // const { version } = await fetchLatestBaileysVersion();
  const WA_VERSION = [2, 3000, 1025190524];
  const sock = makeWASocket({
    version: WA_VERSION,
    auth: state,
    markOnlineOnConnect: false,
  });

  sessions[sessionId] = { sock, qr: null };

  sock.ev.on("creds.update", saveCreds);
  sock.ev.on("connection.update", (update) => {
    handleConnectionUpdate(update, sessionId, sock, userId, io).catch((err) => {
      logger.error(
        `❌ Error in connection update for session ${sessionId}:`,
        err
      );
    });
  });
  sock.ev.on("messages.upsert", (msgUpdate) => {
    handleMessagesUpsert(msgUpdate, sessionId).catch((err) => {
      logger.error(
        `❌ Error handling messages upsert for session ${sessionId}:`,
        err
      );
    });
  });
}

async function handleMessagesUpsert(msgUpdate, sessionId) {
  try {
    const messages = msgUpdate.messages;

    for (const msg of messages) {
      if (!msg.message) continue; // Skip if no message content

      const from = msg.key.remoteJid;
      const isFromMe = msg.key.fromMe;
      const text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption ||
        "[Non-text message]";

      logger.info(`📩 Chat from ${from}: ${text}`);

      const remoteJid = msg.key.remoteJid;

      // Filter hanya untuk kontak pribadi (bukan grup dan bukan newsletter)
      const isPrivateChat = remoteJid.endsWith("@s.whatsapp.net");

      if (isPrivateChat && text !== "[Non-text message]") {
        try {
          // Validasi data sebelum insert
          const messageData = {
            sessionId: sessionId || "unknown",
            from: from || "unknown",
            text: text || "",
            timestamp: msg.messageTimestamp
              ? new Date(Number(msg.messageTimestamp) * 1000)
              : new Date(),
            fromMe: Boolean(isFromMe),
          };

          // Simpan ke database jika perlu
          await ChatMessageModel.create(messageData);

          // Kirim notifikasi ke frontend via Socket.io
          const io = getSocket();
          io.emit("new_message", {
            sessionId,
            from,
            text,
            timestamp: new Date(Number(msg.messageTimestamp) * 1000),
            fromMe: isFromMe,
          });
          logger.info(`💾 Chat message saved to database from ${from}`);
        } catch (dbError) {
          logger.error(`❌ Error saving chat message to database:`, {
            error: dbError.message,
            sessionId,
            from,
            text: text?.substring(0, 50) + "...",
            timestamp: msg.messageTimestamp,
            fromMe: isFromMe,
            constraint: dbError.original?.constraint || "unknown",
            detail: dbError.original?.detail || "no detail",
          });
        }
      }
    }
  } catch (error) {
    logger.error(`❌ Error in handleMessagesUpsert:`, error);
    throw error;
  }
}

async function handleConnectionUpdate(update, sessionId, sock, userId, io) {
  const { connection, lastDisconnect, qr } = update;

  if (qr) await handleQR(qr, sessionId, userId, io);
  if (connection === "close") {
    // sessions[sessionId].isConnected = false;
    await handleDisconnect(lastDisconnect, sessionId, userId);
  } else if (connection === "open") {
    // sessions[sessionId].isConnected = true;
    await handleConnected(sock, sessionId, userId, io);
  }
}

async function handleQR(qr, sessionId, userId, io) {
  const qrData = await QRCode.toDataURL(qr);
  sessions[sessionId].qr = qrData;

  logger.info(`🔄 QR Code updated for session ${sessionId}`);

  await SessionModel.upsert({
    sessionId,
    status: "pending",
    userId,
  });

  logger.info(`💾 Session ${sessionId} saved to DB`);

  if (qrWaiters[sessionId]) {
    qrWaiters[sessionId].forEach((resolve) => resolve(qrData));
    delete qrWaiters[sessionId];
  }
}

async function handleConnected(sock, sessionId, userId, io) {
  sessions[sessionId].qr = null;

  // Ambil userId dari DB jika belum tersedia
  if (!userId) {
    const session = await SessionModel.findOne({ where: { sessionId } });
    userId = session?.userId || null;
  }

  await SessionModel.upsert({
    sessionId,
    status: "connected",
    userId,
    phoneNumber: sock.user.id.split(":")[0],
  });

  logger.info(`🔄 Connection opened for session ${sessionId}`);
  logger.info(`💾 Session ${sessionId} connected to DB`);

  io.emit("qr_scanned", { sessionId, message: "QR Code Scanned" });
}

async function handleDisconnect(lastDisconnect, sessionId, userId) {
  const statusCode = lastDisconnect?.error?.output?.statusCode;
  const statusDescription = getStatusCodeDescription(statusCode);
  logger.info(
    `🔄 Connection closed for session ${sessionId}, reason: ${statusDescription}`
  );

  const AUTO_RECONNECT_REASONS = [
    DisconnectReason.connectionClosed,
    DisconnectReason.connectionLost,
    DisconnectReason.connectionReplaced,
    DisconnectReason.timedOut,
    DisconnectReason.restartRequired,
    DisconnectReason.unavailableService,
  ];

  const DO_NOT_RECONNECT_REASONS = [
    DisconnectReason.loggedOut,
    DisconnectReason.badSession,
    DisconnectReason.multideviceMismatch,
    DisconnectReason.forbidden,
  ];

  if (AUTO_RECONNECT_REASONS.includes(statusCode)) {
    logger.info(`🔄 Attempting to reconnect session ${sessionId}`);
    try {
      await startWhatsApp(sessionId, userId);
    } catch (err) {
      logger.error(`❌ Failed to reconnect session ${sessionId}:`, err);
    }
  } else if (DO_NOT_RECONNECT_REASONS.includes(statusCode)) {
    logger.info(`❌ Session ${sessionId} requires logout/cleanup`);
    cleanupSession(sessionId, userId);
  } else {
    logger.warn(
      `⚠️ Unknown disconnect reason for session ${sessionId}: ${statusCode}. Safe reconnect.`
    );
    try {
      await startWhatsApp(sessionId, userId);
    } catch (err) {
      logger.error(`❌ Failed to reconnect session ${sessionId}:`, err);
    }
  }
}

function cleanupSession(sessionId, userId = null) {
  try {
    const sessionDir = path.resolve(`./sessions/${sessionId}`);
    if (fs.existsSync(sessionDir)) {
      // Try to delete individual files first, then the directory
      try {
        const files = fs.readdirSync(sessionDir);
        for (const file of files) {
          const filePath = path.join(sessionDir, file);
          try {
            fs.unlinkSync(filePath);
          } catch (fileErr) {
            logger.warn(
              `⚠️ Could not delete file ${filePath}: ${fileErr.message}`
            );
          }
        }

        // Try to remove the directory
        fs.rmdirSync(sessionDir);
        logger.info(`🗑️ Session folder ${sessionId} deleted`);
      } catch (dirErr) {
        // If directory deletion fails, try with force option
        try {
          fs.rmSync(sessionDir, { recursive: true, force: true });
          logger.info(`🗑️ Session folder ${sessionId} force deleted`);
        } catch (forceErr) {
          logger.error(
            `❌ Failed to force delete session folder ${sessionId}: ${forceErr.message}`
          );
          // Continue execution even if deletion fails
        }
      }

      deleteSessionFromDB(sessionId, userId).catch((err) => {
        logger.error(`❌ Error deleting session from DB:`, err);
      });
    }
  } catch (err) {
    logger.error(
      `❌ Failed to delete session folder ${sessionId}:`,
      err.message
    );
    // Log additional details for debugging
    logger.error(
      `Session folder path: ${path.resolve(`./sessions/${sessionId}`)}`
    );
    logger.error(`Error details:`, {
      code: err.code,
      errno: err.errno,
      syscall: err.syscall,
      path: err.path,
    });
  }

  // Always cleanup memory references regardless of file deletion success
  delete sessions[sessionId];
  delete qrWaiters[sessionId];
}

async function loadExistingSessions(userId = null) {
  // Ensure sessions directory exists
  ensureSessionsDirectory();

  const sessionsDir = path.resolve("./sessions");

  if (!fs.existsSync(sessionsDir)) return;

  const sessionFolders = fs.readdirSync(sessionsDir);

  for (const sessionId of sessionFolders) {
    try {
      const sessionPath = path.join(sessionsDir, sessionId);
      const stat = fs.statSync(sessionPath);

      if (stat.isDirectory()) {
        logger.info(`🔄 Memuat ulang session: ${sessionId}`);
        await startWhatsApp(sessionId, userId);
      }
    } catch (err) {
      logger.error(`❌ Failed to load session ${sessionId}:`, err);
    }
  }
}

async function deleteSessionFromDB(sessionId, userId = null) {
  try {
    const updateData = { sessionId, status: "logout" };

    // Only include userId in the update if it's not null
    if (userId !== null) {
      updateData.userId = userId;
    }

    await SessionModel.upsert(updateData);
    logger.info(`💾 Session ${sessionId} logged out from DB`);
  } catch (err) {
    logger.error(`❌ Failed to logout DB session ${sessionId}:`, err.message);
  }
}

function getSock(sessionId) {
  return sessions[sessionId]?.sock;
}

function getQRCodeData(sessionId) {
  return sessions[sessionId]?.qr;
}

function waitForQRCode(sessionId) {
  return new Promise((resolve) => {
    const existing = getQRCodeData(sessionId);
    if (existing) {
      resolve(existing);
    } else {
      if (!qrWaiters[sessionId]) qrWaiters[sessionId] = [];
      qrWaiters[sessionId].push(resolve);
    }
  });
}

function getActiveSessionIds() {
  return Object.keys(sessions);
}

module.exports = {
  startWhatsApp,
  getSock,
  getQRCodeData,
  waitForQRCode,
  getActiveSessionIds,
  cleanupSession,
  loadExistingSessions,
  deleteSessionFromDB,
};
