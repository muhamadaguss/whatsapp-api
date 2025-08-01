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

async function startWhatsApp(sessionId, userId = null) {
  const io = getSocket();
  const sessionFolder = path.resolve(`./sessions/${sessionId}`);

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
  sock.ev.on("connection.update", (update) =>
    handleConnectionUpdate(update, sessionId, sock, userId, io)
  );
  sock.ev.on("messages.upsert", async (msgUpdate) => {
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
        // Simpan ke database jika perlu
        await ChatMessageModel.create({
          sessionId,
          from,
          text,
          timestamp: new Date(Number(msg.messageTimestamp) * 1000),
          fromMe: isFromMe,
        });
        // Kirim notifikasi ke frontend via Socket.io
        const io = getSocket();
        io.emit("new_message", {
          sessionId,
          from,
          text,
          timestamp: new Date(Number(msg.messageTimestamp) * 1000),
          fromMe: isFromMe,
        });
      }
    }
  });
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
  logger.info(
    `🔄 Connection closed for session ${sessionId}, reason: ${statusCode}`
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
    await startWhatsApp(sessionId, userId);
  } else if (DO_NOT_RECONNECT_REASONS.includes(statusCode)) {
    logger.info(`❌ Session ${sessionId} requires logout/cleanup`);
    cleanupSession(sessionId, userId);
  } else {
    logger.warn(
      `⚠️ Unknown disconnect reason for session ${sessionId}: ${statusCode}. Safe reconnect.`
    );
    await startWhatsApp(sessionId, userId);
  }
}

function cleanupSession(sessionId, userId = null) {
  try {
    const sessionDir = path.resolve(`./sessions/${sessionId}`);
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
      logger.info(`🗑️ Session folder ${sessionId} deleted`);
      deleteSessionFromDB(sessionId, userId);
    }
  } catch (err) {
    logger.error(
      `❌ Failed to delete session folder ${sessionId}:`,
      err.message
    );
  }

  delete sessions[sessionId];
  delete qrWaiters[sessionId];
}

async function loadExistingSessions(userId = null) {
  const sessionsDir = path.resolve("./sessions");

  if (!fs.existsSync(sessionsDir)) return;

  const sessionFolders = fs.readdirSync(sessionsDir);

  for (const sessionId of sessionFolders) {
    const sessionPath = path.join(sessionsDir, sessionId);
    const stat = fs.statSync(sessionPath);

    if (stat.isDirectory()) {
      logger.info(`🔄 Memuat ulang session: ${sessionId}`);
      await startWhatsApp(sessionId, userId);
    }
  }
}

async function deleteSessionFromDB(sessionId, userId = null) {
  try {
    const updateData = { sessionId, status: "logout", phoneNumber: null };

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
