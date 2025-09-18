const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage,
  getContentType,
} = require("@whiskeysockets/baileys");
const SessionModel = require("../models/sessionModel");
const MessageStatusModel = require("../models/messageStatusModel");
const ChatMessageModel = require("../models/chatModel");
const logger = require("../utils/logger");
const { getSocket } = require("./socket");
const { whatsAppStatusMonitor } = require("../services/whatsAppStatusMonitor");

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
  // const sessionsDir = path.resolve("/app/sessions");
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
  // const sessionFolder = path.resolve(`/app/sessions/${sessionId}`);
  // Check if we can write to sessions directory
  const sessionsDir = path.resolve("./sessions");
  // const sessionsDir = path.resolve("/app/sessions");
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

  // Enhanced WebSocket monitoring with status tracking
  if (sock.ws) {
    sock.ws.on("close", async (code, reason) => {
      logger.warn(
        `🔌 WebSocket closed for session ${sessionId}: ${code} - ${reason}`
      );
      
      // Track WebSocket close event
      await whatsAppStatusMonitor.trackSession(
        sessionId,
        sessionId,
        'websocket_closed',
        { 
          code, 
          reason: reason?.toString(),
          timestamp: new Date(),
          unexpected: code !== 1000 // 1000 is normal closure
        }
      );
    });

    sock.ws.on("error", async (error) => {
      logger.error(
        `❌ WebSocket error for session ${sessionId}:`,
        error.message
      );
      
      // Track WebSocket error
      await whatsAppStatusMonitor.trackSession(
        sessionId,
        sessionId,
        'websocket_error',
        { 
          error: error.message,
          code: error.code,
          timestamp: new Date()
        }
      );
    });

    sock.ws.on("open", async () => {
      logger.info(`✅ WebSocket opened for session ${sessionId}`);
      
      // Track WebSocket open event
      await whatsAppStatusMonitor.trackSession(
        sessionId,
        sessionId,
        'websocket_opened',
        { 
          timestamp: new Date(),
          readyState: sock.ws.readyState
        }
      );
    });

    // Monitor WebSocket ping/pong for connection quality
    sock.ws.on("ping", async () => {
      const pingTimestamp = Date.now();
      
      sock.ws.once("pong", async () => {
        const pongTimestamp = Date.now();
        const responseTime = pongTimestamp - pingTimestamp;
        
        await whatsAppStatusMonitor.trackSession(
          sessionId,
          sessionId,
          'ping_pong',
          { 
            responseTime,
            timestamp: new Date(),
            quality: responseTime < 1000 ? 'good' : responseTime < 3000 ? 'fair' : 'poor'
          }
        );
      });
    });
  }
  sock.ev.on("messages.upsert", (msgUpdate) => {
    handleMessagesUpsert(msgUpdate, sessionId).catch((err) => {
      logger.error(
        `❌ Error handling messages upsert for session ${sessionId}:`,
        err
      );
    });
  });

  // Listen for contact updates
  sock.ev.on("contacts.update", (contactUpdates) => {
    try {
      for (const contact of contactUpdates) {
        if (contact.id && contact.name) {
          const cacheKey = `${sock.user?.id || "unknown"}_${contact.id}`;
          contactNameCache.set(cacheKey, {
            name: contact.name,
            timestamp: Date.now(),
          });
          logger.info(`📱 Contact updated: ${contact.name} (${contact.id})`);
        }
      }
    } catch (error) {
      logger.error(
        `❌ Error handling contact updates for session ${sessionId}:`,
        error
      );
    }
  });

  // Listen for chats update (might contain contact names)
  sock.ev.on("chats.update", (chatUpdates) => {
    try {
      for (const chat of chatUpdates) {
        if (chat.id && chat.name && chat.id.endsWith("@s.whatsapp.net")) {
          const cacheKey = `${sock.user?.id || "unknown"}_${chat.id}`;
          contactNameCache.set(cacheKey, {
            name: chat.name,
            timestamp: Date.now(),
          });
          logger.info(`💬 Chat name updated: ${chat.name} (${chat.id})`);
        }
      }
    } catch (error) {
      logger.error(
        `❌ Error handling chat updates for session ${sessionId}:`,
        error
      );
    }
  });
}

// Helper function to get contact name
async function getContactName(sock, jid) {
  try {
    // Method 1: Try to get from contact store (most reliable)
    if (sock.store && sock.store.contacts && sock.store.contacts[jid]) {
      const contact = sock.store.contacts[jid];
      if (contact.name && contact.name.trim()) {
        logger.info(
          `📱 Found contact name from store: ${contact.name} for ${jid}`
        );
        return contact.name.trim();
      }
    }

    // Method 2: Try to get from chat metadata
    if (sock.store && sock.store.chats) {
      const chat = sock.store.chats[jid];
      if (chat && chat.name && chat.name.trim()) {
        logger.info(`💬 Found contact name from chat: ${chat.name} for ${jid}`);
        return chat.name.trim();
      }
    }

    // Method 3: Try to get profile name (for individual contacts)
    try {
      const profile = await sock.fetchProfile(jid);
      if (profile && profile.name && profile.name.trim()) {
        logger.info(`👤 Found profile name: ${profile.name} for ${jid}`);
        return profile.name.trim();
      }
    } catch (profileError) {
      logger.debug(`Could not fetch profile for ${jid}:`, profileError.message);
    }

    // Method 4: Try business profile (for business accounts)
    try {
      const businessProfile = await sock.getBusinessProfile(jid);
      if (
        businessProfile &&
        businessProfile.description &&
        businessProfile.description.trim()
      ) {
        logger.info(
          `🏢 Found business name: ${businessProfile.description} for ${jid}`
        );
        return businessProfile.description.trim();
      }
    } catch (businessError) {
      logger.debug(
        `Could not fetch business profile for ${jid}:`,
        businessError.message
      );
    }

    // Method 5: Try to get from presence (sometimes contains name)
    try {
      const presence = await sock.presenceSubscribe(jid);
      // This is mainly for subscribing to presence updates, name might be available later
    } catch (presenceError) {
      logger.debug(
        `Could not subscribe to presence for ${jid}:`,
        presenceError.message
      );
    }

    // Fallback: extract phone number from JID
    const phoneNumber = jid.split("@")[0];
    logger.info(`📞 Using phone number as fallback: ${phoneNumber} for ${jid}`);
    return phoneNumber;
  } catch (error) {
    logger.warn(`⚠️ Error getting contact name for ${jid}:`, error.message);
    // Fallback: return phone number
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

// Cache for contact names to avoid repeated API calls
const contactNameCache = new Map();
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

// Enhanced function to get contact name with caching
async function getContactNameWithCache(sock, jid) {
  // Check cache first
  const cacheKey = `${sock.user?.id || "unknown"}_${jid}`;
  const cached = contactNameCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.name;
  }

  // Get fresh contact name
  const contactName = await getContactName(sock, jid);

  // Cache the result
  contactNameCache.set(cacheKey, {
    name: contactName,
    timestamp: Date.now(),
  });

  return contactName;
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
        let text = "[Non-text message]";
        let messageType = "text";
        let mediaUrl = null;

        const messageTypeDetected = getContentType(msg.message);

        // === TEXT MESSAGE ===
        if (msg.message?.conversation) {
          text = msg.message.conversation;
          messageType = "text";
        } else if (msg.message?.extendedTextMessage?.text) {
          text = msg.message.extendedTextMessage.text;
          messageType = "text";
        }

        // === IMAGE MESSAGE ===
        else if (msg.message?.imageMessage) {
          text = msg.message.imageMessage.caption || "[Image]";
          messageType = "image";

          // Only download and save images from personal chats (not groups/newsletters)
          const isPrivateChat = from.endsWith("@s.whatsapp.net");
          const ENABLE_IMAGE_DOWNLOAD = true;

          if (ENABLE_IMAGE_DOWNLOAD && isPrivateChat) {
            try {
              logger.info(
                `📷 Attempting to download image from personal chat: ${from}`
              );

              const buffer = await downloadMediaMessage(
                msg,
                "buffer",
                {},
                { reuploadRequest: sock.updateMediaMessage }
              );

              if (buffer && buffer.length > 0) {
                // Create media directory for received media
                const mediaDir = path.join(__dirname, "../media");
                if (!fs.existsSync(mediaDir)) {
                  fs.mkdirSync(mediaDir, { recursive: true });
                  logger.info(`📁 Created media directory: ${mediaDir}`);
                }

                let extension = "jpg";
                if (msg.message.imageMessage.mimetype) {
                  const mimeType = msg.message.imageMessage.mimetype;
                  if (mimeType.includes("png")) extension = "png";
                  else if (mimeType.includes("gif")) extension = "gif";
                  else if (mimeType.includes("webp")) extension = "webp";
                }

                const fileName = `image_${Date.now()}_${Math.random()
                  .toString(36)
                  .substring(7)}.${extension}`;
                const filePath = path.join(mediaDir, fileName);

                fs.writeFileSync(filePath, buffer);
                mediaUrl = `/media/${fileName}`;
                logger.info(
                  `📷 Image saved successfully: ${fileName} (${buffer.length} bytes)`
                );
              } else {
                logger.warn(`⚠️ Downloaded image buffer is empty or null`);
              }
            } catch (downloadError) {
              logger.error(`❌ Failed to download image:`, {
                error: downloadError.message,
                stack: downloadError.stack,
                from,
                messageId: msg.key.id,
                baileys_version:
                  require("../package.json").dependencies[
                    "@whiskeysockets/baileys"
                  ],
              });
              logger.info(
                `📷 Continuing without image download for message from ${from}`
              );
            }
          } else if (!isPrivateChat) {
            logger.info(
              `📷 Skipping image download from group/newsletter: ${from}`
            );
          }
        }

        // === VIDEO MESSAGE ===
        else if (msg.message?.videoMessage) {
          text = msg.message.videoMessage.caption || "[Video]";
          messageType = "video";

          // Only download and save videos from personal chats (not groups/newsletters)
          const isPrivateChat = from.endsWith("@s.whatsapp.net");

          if (isPrivateChat) {
            try {
              logger.info(
                `🎥 Attempting to download video from personal chat: ${from}`
              );

              const buffer = await downloadMediaMessage(
                msg,
                "buffer",
                {},
                { reuploadRequest: sock.updateMediaMessage }
              );
              if (buffer && buffer.length > 0) {
                const mediaDir = path.join(__dirname, "../media");
                if (!fs.existsSync(mediaDir)) {
                  fs.mkdirSync(mediaDir, { recursive: true });
                  logger.info(`📁 Created media directory: ${mediaDir}`);
                }
                const fileName = `video_${Date.now()}.mp4`;
                const filePath = path.join(mediaDir, fileName);
                fs.writeFileSync(filePath, buffer);
                mediaUrl = `/media/${fileName}`;
                logger.info(
                  `🎥 Video saved successfully: ${fileName} (${buffer.length} bytes)`
                );
              } else {
                logger.warn(`⚠️ Downloaded video buffer is empty or null`);
              }
            } catch (err) {
              logger.error(`❌ Failed to download video:`, {
                error: err.message,
                from,
                messageId: msg.key.id,
              });
              logger.warn(
                `🎥 Continuing without video download for message from ${from}`
              );
            }
          } else {
            logger.info(
              `🎥 Skipping video download from group/newsletter: ${from}`
            );
          }
        }

        // === AUDIO MESSAGE ===
        else if (msg.message?.audioMessage) {
          text = "[Audio]";
          messageType = "audio";

          // Only download and save audio from personal chats (not groups/newsletters)
          const isPrivateChat = from.endsWith("@s.whatsapp.net");

          if (isPrivateChat) {
            try {
              logger.info(
                `🎵 Attempting to download audio from personal chat: ${from}`
              );

              const buffer = await downloadMediaMessage(
                msg,
                "buffer",
                {},
                { reuploadRequest: sock.updateMediaMessage }
              );
              if (buffer && buffer.length > 0) {
                const mediaDir = path.join(__dirname, "../media");
                if (!fs.existsSync(mediaDir)) {
                  fs.mkdirSync(mediaDir, { recursive: true });
                  logger.info(`📁 Created media directory: ${mediaDir}`);
                }
                const fileName = `audio_${Date.now()}.ogg`;
                const filePath = path.join(mediaDir, fileName);
                fs.writeFileSync(filePath, buffer);
                mediaUrl = `/media/${fileName}`;
                logger.info(
                  `🎵 Audio saved successfully: ${fileName} (${buffer.length} bytes)`
                );
              } else {
                logger.warn(`⚠️ Downloaded audio buffer is empty or null`);
              }
            } catch (err) {
              logger.error(`❌ Failed to download audio:`, {
                error: err.message,
                from,
                messageId: msg.key.id,
              });
              logger.warn(
                `🎵 Continuing without audio download for message from ${from}`
              );
            }
          } else {
            logger.info(
              `🎵 Skipping audio download from group/newsletter: ${from}`
            );
          }
        }

        // === DOCUMENT MESSAGE ===
        else if (msg.message?.documentMessage) {
          text = `[Document: ${
            msg.message.documentMessage.fileName || "Unknown"
          }]`;
          messageType = "document";

          // Only download and save documents from personal chats (not groups/newsletters)
          const isPrivateChat = from.endsWith("@s.whatsapp.net");

          if (isPrivateChat) {
            try {
              logger.info(
                `📄 Attempting to download document from personal chat: ${from}`
              );

              const buffer = await downloadMediaMessage(
                msg,
                "buffer",
                {},
                { reuploadRequest: sock.updateMediaMessage }
              );
              if (buffer && buffer.length > 0) {
                const mediaDir = path.join(__dirname, "../media");
                if (!fs.existsSync(mediaDir)) {
                  fs.mkdirSync(mediaDir, { recursive: true });
                  logger.info(`📁 Created media directory: ${mediaDir}`);
                }
                const fileName =
                  msg.message.documentMessage.fileName || `doc_${Date.now()}`;
                const filePath = path.join(mediaDir, fileName);
                fs.writeFileSync(filePath, buffer);
                mediaUrl = `/media/${fileName}`;
                logger.info(
                  `📄 Document saved successfully: ${fileName} (${buffer.length} bytes)`
                );
              } else {
                logger.warn(`⚠️ Downloaded document buffer is empty or null`);
              }
            } catch (err) {
              logger.error(`❌ Failed to download document:`, {
                error: err.message,
                from,
                messageId: msg.key.id,
              });
              logger.warn(
                `📄 Continuing without document download for message from ${from}`
              );
            }
          } else {
            logger.info(
              `📄 Skipping document download from group/newsletter: ${from}`
            );
          }
        }

        // === GET CONTACT NAME ===
        const contactName = isFromMe
          ? "Me"
          : await getContactNameWithCache(sock, from);

        logger.info(`📩 Chat from ${contactName} (${from}): ${text}`);

        // === SAVE ONLY PRIVATE CHAT (NOT GROUP / NOT NEWSLETTER) ===
        const isPrivateChat = from.endsWith("@s.whatsapp.net");

        if (isPrivateChat && text !== "[Non-text message]") {
          try {
            const messageData = {
              sessionId: sessionId || "unknown",
              from: from || "unknown",
              contactName: contactName,
              text: text || "",
              messageType: messageType || "text",
              mediaUrl: mediaUrl,
              timestamp: msg.messageTimestamp
                ? new Date(Number(msg.messageTimestamp) * 1000)
                : new Date(),
              fromMe: Boolean(isFromMe),
              isRead: Boolean(isFromMe),
            };

            await ChatMessageModel.create(messageData);

            const io = getSocket();
            io.emit("new_message", {
              sessionId,
              from,
              contactName,
              text,
              messageType,
              mediaUrl,
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
      }
    }
  } catch (error) {
    logger.error(`❌ Error in handleMessagesUpsert:`, {
      error: error.message,
      sessionId,
      stack: error.stack,
    });
  }
}

async function handleConnectionUpdate(update, sessionId, sock, userId, io) {
  try {
    const { connection, lastDisconnect, qr, isNewLogin, isOnline, receivedPendingNotifications } = update;

    logger.info(`🔄 Connection update for session ${sessionId}: ${connection}`);

    // Enhanced status tracking with WhatsAppStatusMonitor
    const statusMetadata = {
      connection,
      isNewLogin,
      isOnline,
      receivedPendingNotifications,
      lastDisconnect: lastDisconnect ? {
        error: lastDisconnect.error,
        output: lastDisconnect.output
      } : null,
      timestamp: new Date(),
      responseTime: sock.ws?.pingInterval || 0
    };

    // Track status based on connection state
    let trackingStatus = 'unknown';
    switch (connection) {
      case 'connecting':
        trackingStatus = 'connecting';
        break;
      case 'open':
        trackingStatus = 'connected';
        break;
      case 'close':
        // Determine if it's a temporary disconnect or permanent issue
        if (lastDisconnect?.error?.output?.statusCode) {
          const statusCode = lastDisconnect.error.output.statusCode;
          if (statusCode === DisconnectReason.loggedOut) {
            trackingStatus = 'logged_out';
          } else if (statusCode === DisconnectReason.forbidden) {
            trackingStatus = 'blocked';
          } else if (statusCode === DisconnectReason.badSession) {
            trackingStatus = 'banned';
          } else {
            trackingStatus = 'disconnected';
          }
        } else {
          trackingStatus = 'disconnected';
        }
        break;
      default:
        trackingStatus = 'unknown';
    }

    // Track the status with enhanced metadata
    await whatsAppStatusMonitor.trackSession(
      sessionId,
      sessionId, // whatsappSessionId same as sessionId in this context
      trackingStatus,
      statusMetadata
    );

    if (qr) {
      try {
        await handleQR(qr, sessionId, userId, io);
        // Track QR generation
        await whatsAppStatusMonitor.trackSession(
          sessionId,
          sessionId,
          'qr_generated',
          { ...statusMetadata, qr: true }
        );
      } catch (qrError) {
        logger.error(`❌ Error handling QR for session ${sessionId}:`, {
          error: qrError.message,
          stack: qrError.stack,
        });
        await whatsAppStatusMonitor.trackSession(
          sessionId,
          sessionId,
          'qr_error',
          { ...statusMetadata, error: qrError.message }
        );
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
        await whatsAppStatusMonitor.trackSession(
          sessionId,
          sessionId,
          'disconnect_error',
          { ...statusMetadata, error: disconnectError.message }
        );
        throw disconnectError;
      }
    } else if (connection === "open") {
      try {
        await handleConnected(sock, sessionId, userId, io);
        
        // Track successful connection with additional metadata
        const connectionMetadata = {
          ...statusMetadata,
          phoneNumber: sock.user?.id?.split(':')[0],
          deviceInfo: sock.user?.name,
          platform: sock.user?.platform,
          connectionTime: new Date()
        };
        
        await whatsAppStatusMonitor.trackSession(
          sessionId,
          sessionId,
          'connected',
          connectionMetadata
        );
        
      } catch (connectError) {
        logger.error(`❌ Error handling connected for session ${sessionId}:`, {
          error: connectError.message,
          stack: connectError.stack,
        });
        await whatsAppStatusMonitor.trackSession(
          sessionId,
          sessionId,
          'connect_error',
          { ...statusMetadata, error: connectError.message }
        );
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
    
    // Track the error
    await whatsAppStatusMonitor.trackSession(
      sessionId,
      sessionId,
      'connection_error',
      { error: error.message, update }
    ).catch(trackError => {
      logger.error(`❌ Failed to track connection error:`, trackError);
    });
    
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

// Function to refresh contact names for a session
async function refreshContactNames(sessionId) {
  try {
    const sock = sessions[sessionId]?.sock;
    if (!sock) {
      throw new Error(`Session ${sessionId} not found`);
    }

    logger.info(`🔄 Refreshing contact names for session ${sessionId}...`);

    // Clear cache for this session
    const sessionPrefix = `${sock.user?.id || "unknown"}_`;
    for (const [key] of contactNameCache) {
      if (key.startsWith(sessionPrefix)) {
        contactNameCache.delete(key);
      }
    }

    // Get all unique contacts from database
    const uniqueContacts = await ChatMessageModel.findAll({
      attributes: ["from"],
      where: { sessionId },
      group: ["from"],
      raw: true,
    });

    let updatedCount = 0;
    for (const contact of uniqueContacts) {
      const jid = contact.from;
      if (jid.endsWith("@s.whatsapp.net")) {
        try {
          const contactName = await getContactName(sock, jid);

          // Update database records
          await ChatMessageModel.update(
            { contactName },
            { where: { sessionId, from: jid } }
          );

          updatedCount++;
          logger.info(`✅ Updated contact: ${contactName} (${jid})`);
        } catch (error) {
          logger.warn(`⚠️ Failed to update contact ${jid}:`, error.message);
        }
      }
    }

    logger.info(
      `🎉 Contact refresh completed: ${updatedCount} contacts updated`
    );
    return { success: true, updatedCount };
  } catch (error) {
    logger.error(`❌ Error refreshing contact names:`, error);
    return { success: false, error: error.message };
  }
}

// Function to get contact name for external use
async function getContactNameForSession(sessionId, jid) {
  try {
    const sock = sessions[sessionId]?.sock;
    if (!sock) {
      throw new Error(`Session ${sessionId} not found`);
    }

    return await getContactNameWithCache(sock, jid);
  } catch (error) {
    logger.error(`❌ Error getting contact name:`, error);
    return jid.split("@")[0]; // Fallback to phone number
  }
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
  refreshContactNames,
  getContactNameForSession,
};
