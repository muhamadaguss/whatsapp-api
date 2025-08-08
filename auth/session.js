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
  // const sessionsDir = path.resolve("./sessions");
  const sessionsDir = path.resolve("/app/sessions");
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

  // const sessionFolder = path.resolve(`./sessions/${sessionId}`);
  const sessionFolder = path.resolve(`/app/sessions/${sessionId}`);
  // Check if we can write to sessions directory
  // const sessionsDir = path.resolve("./sessions");
  const sessionsDir = path.resolve("/app/sessions");
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

// Helper function to get contact name
async function getContactName(sock, jid) {
  try {
    // Try to get contact info from WhatsApp
    const contactInfo = await sock.onWhatsApp(jid);
    if (contactInfo && contactInfo.length > 0) {
      // Get the contact name from the store
      const contact = await sock.store?.contacts?.[jid];
      if (contact && contact.name) {
        return contact.name;
      }

      // Try to get from business profile
      try {
        const profile = await sock.getBusinessProfile(jid);
        if (profile && profile.description) {
          return profile.description;
        }
      } catch (profileError) {
        // Ignore profile errors
      }
    }

    // Fallback: extract phone number from JID
    const phoneNumber = jid.split("@")[0];
    return phoneNumber;
  } catch (error) {
    logger.warn(`⚠️ Could not get contact name for ${jid}:`, error.message);
    // Fallback: return the original JID or phone number
    return jid.split("@")[0];
  }
}

// Enhanced function to get detailed contact information
async function getContactDetails(sock, jid) {
  try {
    const phoneNumber = jid.split("@")[0];
    const contactDetails = {
      jid: jid,
      phoneNumber: phoneNumber,
      name: phoneNumber, // Default fallback
      profilePicture: null,
      status: null,
      businessProfile: null,
      isOnWhatsApp: false,
      lastSeen: null,
      isBlocked: false,
      isBusiness: false,
      verifiedName: null,
      pushName: null,
    };

    // Check if number is on WhatsApp
    try {
      const onWhatsAppResult = await sock.onWhatsApp(jid);
      if (onWhatsAppResult && onWhatsAppResult.length > 0) {
        contactDetails.isOnWhatsApp = true;
        contactDetails.verifiedName = onWhatsAppResult[0].verifiedName || null;
      }
    } catch (error) {
      logger.warn(`Could not check WhatsApp status for ${jid}:`, error.message);
    }

    // Get contact name from store
    try {
      const contact = sock.store?.contacts?.[jid];
      if (contact) {
        contactDetails.name = contact.name || contact.notify || phoneNumber;
        contactDetails.pushName = contact.notify || null;
      }
    } catch (error) {
      logger.warn(
        `Could not get contact from store for ${jid}:`,
        error.message
      );
    }

    // Get profile picture
    try {
      const profilePicUrl = await sock.profilePictureUrl(jid, "image");
      contactDetails.profilePicture = profilePicUrl;
    } catch (error) {
      // Profile picture might not exist, that's okay
      logger.debug(`No profile picture for ${jid}`);
    }

    // Get status
    try {
      const status = await sock.fetchStatus(jid);
      if (status && status.status) {
        contactDetails.status = status.status;
      }
    } catch (error) {
      // Status might be private, that's okay
      logger.debug(`Could not fetch status for ${jid}`);
    }

    // Get business profile if it's a business account
    try {
      const businessProfile = await sock.getBusinessProfile(jid);
      if (businessProfile) {
        contactDetails.businessProfile = {
          description: businessProfile.description || null,
          category: businessProfile.category || null,
          email: businessProfile.email || null,
          website: businessProfile.website || null,
          address: businessProfile.address || null,
        };
        contactDetails.isBusiness = true;
        if (
          businessProfile.description &&
          !contactDetails.name.includes(businessProfile.description)
        ) {
          contactDetails.name = businessProfile.description;
        }
      }
    } catch (error) {
      // Not a business account, that's okay
      logger.debug(`No business profile for ${jid}`);
    }

    // Get presence (last seen)
    try {
      await sock.presenceSubscribe(jid);
      const presence = sock.store?.presences?.[jid];
      if (presence) {
        const lastSeen = presence.lastKnownPresence;
        if (lastSeen && lastSeen !== "unavailable") {
          contactDetails.lastSeen = lastSeen;
        }
      }
    } catch (error) {
      logger.debug(`Could not get presence for ${jid}`);
    }

    return contactDetails;
  } catch (error) {
    logger.error(`❌ Error getting contact details for ${jid}:`, error.message);
    // Return basic fallback
    return {
      jid: jid,
      phoneNumber: jid.split("@")[0],
      name: jid.split("@")[0],
      profilePicture: null,
      status: null,
      businessProfile: null,
      isOnWhatsApp: false,
      lastSeen: null,
      isBlocked: false,
      isBusiness: false,
      verifiedName: null,
      pushName: null,
    };
  }
}

async function handleMessagesUpsert(msgUpdate, sessionId) {
  try {
    const messages = msgUpdate.messages;
    const sock = sessions[sessionId]?.sock;

    for (const msg of messages) {
      try {
        if (!msg.message) continue; // Skip if no message content

        const from = msg.key.remoteJid;
        const isFromMe = msg.key.fromMe;
        const text =
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          msg.message?.imageMessage?.caption ||
          msg.message?.videoMessage?.caption ||
          "[Non-text message]";

        // Get contact name instead of using JID
        const contactName = isFromMe ? "Me" : await getContactName(sock, from);

        logger.info(`📩 Chat from ${contactName} (${from}): ${text}`);

        const remoteJid = msg.key.remoteJid;

        // Filter hanya untuk kontak pribadi (bukan grup dan bukan newsletter)
        const isPrivateChat = remoteJid.endsWith("@s.whatsapp.net");

        if (isPrivateChat && text !== "[Non-text message]") {
          try {
            // Validasi data sebelum insert
            const messageData = {
              sessionId: sessionId || "unknown",
              from: from || "unknown", // Keep JID for database consistency
              contactName: contactName, // Add contact name field
              text: text || "",
              timestamp: msg.messageTimestamp
                ? new Date(Number(msg.messageTimestamp) * 1000)
                : new Date(),
              fromMe: Boolean(isFromMe),
              isRead: Boolean(isFromMe), // Messages from me are automatically read
            };

            // Simpan ke database jika perlu
            await ChatMessageModel.create(messageData);

            // Kirim notifikasi ke frontend via Socket.io
            const io = getSocket();
            io.emit("new_message", {
              sessionId,
              from,
              contactName, // Send contact name to frontend
              text,
              timestamp: new Date(Number(msg.messageTimestamp) * 1000),
              fromMe: isFromMe,
              isRead: Boolean(isFromMe),
            });
            logger.info(
              `💾 Chat message saved to database from ${contactName} (${from})`
            );
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
      } catch (msgError) {
        logger.error(`❌ Error processing individual message:`, {
          error: msgError.message,
          sessionId,
          messageKey: msg.key,
          stack: msgError.stack,
        });
        // Continue processing other messages
      }
    }
  } catch (error) {
    logger.error(`❌ Error in handleMessagesUpsert:`, {
      error: error.message,
      sessionId,
      stack: error.stack,
    });
    // Don't throw error to prevent session crash
  }
}

async function handleConnectionUpdate(update, sessionId, sock, userId, io) {
  try {
    const { connection, lastDisconnect, qr } = update;

    logger.info(`🔄 Connection update for session ${sessionId}: ${connection}`);

    if (qr) {
      try {
        await handleQR(qr, sessionId, userId, io);
      } catch (qrError) {
        logger.error(`❌ Error handling QR for session ${sessionId}:`, {
          error: qrError.message,
          stack: qrError.stack,
        });
        throw qrError;
      }
    }

    if (connection === "close") {
      try {
        await handleDisconnect(lastDisconnect, sessionId, userId);
      } catch (disconnectError) {
        logger.error(`❌ Error handling disconnect for session ${sessionId}:`, {
          error: disconnectError.message,
          stack: disconnectError.stack,
        });
        throw disconnectError;
      }
    } else if (connection === "open") {
      try {
        await handleConnected(sock, sessionId, userId, io);
      } catch (connectError) {
        logger.error(`❌ Error handling connected for session ${sessionId}:`, {
          error: connectError.message,
          stack: connectError.stack,
        });
        throw connectError;
      }
    }
  } catch (error) {
    logger.error(
      `❌ Error in handleConnectionUpdate for session ${sessionId}:`,
      {
        error: error.message,
        connection: update?.connection,
        hasQR: !!update?.qr,
        hasLastDisconnect: !!update?.lastDisconnect,
        stack: error.stack,
      }
    );
    // Don't re-throw to prevent session crash
  }
}

async function handleQR(qr, sessionId, userId, io) {
  try {
    const qrData = await QRCode.toDataURL(qr);

    // Ensure session exists before setting QR
    if (!sessions[sessionId]) {
      sessions[sessionId] = { sock: null, qr: null };
    }

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
  } catch (error) {
    logger.error(`❌ Error in handleQR for session ${sessionId}:`, {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

async function handleConnected(sock, sessionId, userId, io) {
  try {
    // Ensure session exists
    if (!sessions[sessionId]) {
      sessions[sessionId] = { sock: null, qr: null };
    }

    sessions[sessionId].qr = null;

    // Ambil userId dari DB jika belum tersedia
    if (!userId) {
      try {
        const session = await SessionModel.findOne({ where: { sessionId } });
        userId = session?.userId || null;
      } catch (dbError) {
        logger.warn(
          `⚠️ Could not fetch userId from DB for session ${sessionId}:`,
          dbError.message
        );
      }
    }

    // Validate sock.user exists
    if (!sock.user || !sock.user.id) {
      throw new Error("Socket user information is not available");
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
  } catch (error) {
    logger.error(`❌ Error in handleConnected for session ${sessionId}:`, {
      error: error.message,
      hasUser: !!sock?.user,
      userId: sock?.user?.id,
      stack: error.stack,
    });
    throw error;
  }
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
  getContactDetails,
};
