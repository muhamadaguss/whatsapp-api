const fs = require("fs");
const xlsx = require("xlsx");
const { getSock } = require("../auth/session");
const Blast = require("../models/blastModel");
const logger = require("../utils/logger"); // Mengimpor logger
const MessageStatusModel = require("../models/messageStatusModel");
const { getSocket } = require("../auth/socket");
const Boom = require("@hapi/boom");
const SpinTextEngine = require("../utils/spinTextEngine");
const BlastRealTimeService = require("./blastRealTimeService");

// Create singleton instance
const blastRealTimeService = new BlastRealTimeService(); // Import real-time service

function randomDelay(min = 60, max = 120) {
  return Math.floor(Math.random() * (max - min + 1) + min) * 1000;
}

function replaceVariablesInMessage(template, data) {
  // First, apply spin text processing
  const spunTemplate = SpinTextEngine.parseSpinText(template);

  // Then replace variables like {name}, {company}, etc.
  const regex = /\{(\w+)\}/g;
  return spunTemplate.replace(regex, (_, variableName) => {
    return data?.[variableName] ?? "";
  });
}

async function processExcelAndSendMessages(
  filePath,
  sessionId,
  messageTemplate = "",
  notifyNumber = null,
  userId = null,
  selectTarget = null,
  inputNumbers = null
) {
  try {
    let rows = [];
    logger.info(`Select target: ${selectTarget}`);
    logger.info(`Input numbers: ${inputNumbers}`);
    if (selectTarget === "input" && inputNumbers) {
      rows = inputNumbers
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => {
          const [no, name] = line.split("|").map((part) => part.trim());
          const row = { no };
          if (name) row.name = name;
          return row;
        });
    } else {
      const workbook = xlsx.readFile(filePath);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      rows = xlsx.utils.sheet_to_json(sheet);
    }

    logger.info(`Processed rows: ${JSON.stringify(rows)}`);
    const sock = getSock(sessionId);
    const io = getSocket();

    const campaignId = `campaign-${Date.now()}-${notifyNumber}`;
    const resultsSocket = {
      id: campaignId,
      name: campaignId,
      date: new Date().toISOString(),
      total: rows.length,
      progress: 0,
      success: 0,
      failed: 0,
      status: "in-progress",
      userId,
    };

    const results = [];

    if (!sock || typeof sock.sendMessage !== "function") {
      await emitFailure(
        `Session "${sessionId}" tidak ditemukan atau tidak valid`,
        rows.length
      );
      return [];
    }

    // Check if template has spin text and log info
    const hasSpinText = SpinTextEngine.hasSpinText(messageTemplate);
    const estimatedVariations =
      SpinTextEngine.estimateVariations(messageTemplate);

    logger.info(
      `🚀 Mulai proses blast dengan sessionId: ${sessionId}, total kontak: ${rows.length}`
    );

    if (hasSpinText) {
      logger.info(
        `🎲 Spin text detected! Estimated variations: ${estimatedVariations}`
      );
    }

    function emitSocket() {
      // Calculate accurate progress percentage
      const processedCount = resultsSocket.success + resultsSocket.failed;
      resultsSocket.progress = Math.min(
        100,
        Math.round((processedCount / resultsSocket.total) * 100)
      );
      
      // Enhanced real-time emission using blastRealTimeService
      if (campaignId) {
        try {
          // Create session-like object for progress calculation
          const sessionData = {
            sessionId: campaignId,
            totalMessages: resultsSocket.total,
            sentCount: resultsSocket.success,
            failedCount: resultsSocket.failed,
            skippedCount: 0,
            status: resultsSocket.status || "PROCESSING"
          };

          // Emit real-time progress update
          blastRealTimeService.emitSessionProgress(campaignId, {
            processedCount,
            totalMessages: resultsSocket.total,
            sentCount: resultsSocket.success,
            failedCount: resultsSocket.failed,
            progressPercentage: resultsSocket.progress,
            reason: 'Real-time blast progress update'
          });

          logger.info(
            `📡 Enhanced emit status: ${resultsSocket.progress}% | Processed: ${processedCount}/${resultsSocket.total} | Success: ${resultsSocket.success} | Failed: ${resultsSocket.failed}`
          );
        } catch (emitError) {
          logger.warn(`⚠️ Failed to emit enhanced progress, falling back to legacy:`, emitError.message);
        }
      }
      
      // Legacy socket emission for backward compatibility
      io?.emit("blast-status", resultsSocket);
      
      // Also log for debugging
      logger.info(
        `📡 Legacy emit status: ${resultsSocket.progress}% | Processed: ${processedCount}/${resultsSocket.total} | Success: ${resultsSocket.success} | Failed: ${resultsSocket.failed}`
      );
    }

    async function emitFailure(reason, failedCount) {
      logger.error(`❌ ${reason}`);
      await Blast.upsert({
        messageTemplate,
        totalRecipients: rows.length,
        sentCount: resultsSocket.success,
        failedCount: failedCount,
        status: "error",
        userId,
        campaignId,
      });
      resultsSocket.failed = failedCount;
      resultsSocket.status = "error";
      emitSocket();
    }

    function withTimeout(promise, timeout = 15000) {
      return Promise.race([
        promise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), timeout)
        ),
      ]);
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const phone = String(row["no"]).replace(/\D/g, "");
      const message = replaceVariablesInMessage(messageTemplate, row);

      if (!phone || !message) {
        logger.warn(`⚠️ Baris ${i + 1}: Nomor atau pesan kosong`);
        results.push({
          phone,
          status: "error",
          reason: "Missing phone/message",
        });
        resultsSocket.failed++;
        
        // Emit real-time failed notification
        if (campaignId) {
          try {
            await blastRealTimeService.emitFailedMessage(campaignId, {
              messageIndex: i,
              phoneNumber: phone,
              contactName: row?.name || row?.nama || null,
              errorType: "validation_error",
              errorMessage: "Missing phone number or message content",
              errorCode: "MISSING_DATA",
              retryCount: 0,
              maxRetries: 0, // No retry for validation errors
              failedAt: new Date().toISOString()
            });
          } catch (emitError) {
            logger.warn(`⚠️ Failed to emit failed notification: ${emitError.message}`);
          }
        }
        
        emitSocket();
        continue;
      }

      try {
        logger.info(`🔍 Mengecek nomor WhatsApp: ${phone}`);
        const [check] = await withTimeout(
          sock.onWhatsApp(`${phone}@s.whatsapp.net`)
        );

        if (!check?.exists) {
          logger.warn(`❌ Nomor tidak ditemukan di WhatsApp: ${phone}`);
          results.push({
            phone,
            status: "error",
            reason: "Nomor tidak aktif di WhatsApp",
          });
          resultsSocket.failed++;
          
          // Emit real-time failed notification for inactive number
          if (campaignId) {
            try {
              await blastRealTimeService.emitFailedMessage(campaignId, {
                messageIndex: i,
                phoneNumber: phone,
                contactName: row?.name || row?.nama || null,
                errorType: "inactive_number",
                errorMessage: "Phone number is not active on WhatsApp",
                errorCode: "INACTIVE_NUMBER",
                retryCount: 0,
                maxRetries: 0, // No retry for inactive numbers
                failedAt: new Date().toISOString()
              });
            } catch (emitError) {
              logger.warn(`⚠️ Failed to emit failed notification: ${emitError.message}`);
            }
          }
          
          emitSocket();
          continue;
        }

        logger.info(`✉️ Mengirim pesan ke: ${phone}`);
        const sentMsg = await withTimeout(
          sock.sendMessage(`${phone}@s.whatsapp.net`, { text: message })
        );
        logger.info(
          `✅ Pesan terkirim ke: ${phone}, messageId: ${sentMsg.key.id}`
        );

        try {
          await MessageStatusModel.upsert({
            messageId: sentMsg.key.id,
            phone,
            status: "sent",
            userId,
            sessionId,
            message,
            deliveredAt: new Date(),
            readAt: null,
          });
          logger.info(`💾 Status pesan disimpan ke database untuk ${phone}`);
        } catch (dbError) {
          logger.error(`❌ Gagal simpan status ke database untuk ${phone}:`, {
            error: dbError.message,
            messageId: sentMsg.key.id,
            phone,
            userId,
            sessionId,
          });
          // Jangan throw error, biarkan proses blast lanjut
        }

        results.push({ phone, status: "success", messageId: sentMsg.key.id });
        resultsSocket.success++;
        
        // Emit real-time success notification if sessionId is available for blast campaigns
        if (campaignId) {
          try {
            await blastRealTimeService.emitSuccessMessage(campaignId, {
              messageIndex: i,
              phoneNumber: phone,
              contactName: row?.name || row?.nama || null,
              whatsappMessageId: sentMsg.key.id,
              sentAt: new Date().toISOString()
            });
          } catch (emitError) {
            logger.warn(`⚠️ Failed to emit success notification: ${emitError.message}`);
          }
        }

        // Emit progress update after success
        emitSocket();
      } catch (err) {
        const isSessionError =
          /not connected|disconnected|logout|terminated|conn|closed/i.test(
            err.message
          );
        const isTimeoutError =
          Boom.isBoom(err) && err.output?.statusCode === 408;

        logger.error(`❌ Gagal kirim ke ${phone}: ${err.message}`);

        // Determine error type for better categorization
        let errorType = "unknown_error";
        let errorCode = "UNKNOWN_ERROR";
        let canRetry = true;

        if (isTimeoutError) {
          errorType = "timeout_error";
          errorCode = "TIMEOUT";
          logger.warn(`⚠️ Timeout saat proses nomor ${phone}, akan di-skip`);
          results.push({
            phone,
            status: "error",
            reason: "Timeout saat verifikasi nomor",
          });
          resultsSocket.failed++;
          
          // Emit timeout error notification
          if (campaignId) {
            try {
              await blastRealTimeService.emitFailedMessage(campaignId, {
                messageIndex: i,
                phoneNumber: phone,
                contactName: row?.name || row?.nama || null,
                errorType,
                errorMessage: "Timeout during number verification",
                errorCode,
                retryCount: 0,
                maxRetries: 3,
                failedAt: new Date().toISOString()
              });
            } catch (emitError) {
              logger.warn(`⚠️ Failed to emit timeout notification: ${emitError.message}`);
            }
          }
          
          emitSocket();
          continue; // skip dan lanjut ke nomor berikutnya
        }

        if (isSessionError) {
          errorType = "session_error";
          errorCode = "SESSION_DISCONNECTED";
          canRetry = false;
        } else if (err.message.includes("rate") || err.message.includes("limit")) {
          errorType = "rate_limit";
          errorCode = "RATE_LIMITED";
        } else if (err.message.includes("blocked") || err.message.includes("spam")) {
          errorType = "blocked_number";
          errorCode = "NUMBER_BLOCKED";
          canRetry = false;
        }

        results.push({ phone, status: "error", reason: err.message });
        resultsSocket.failed++;

        // Emit detailed failed message notification
        if (campaignId) {
          try {
            await blastRealTimeService.emitFailedMessage(campaignId, {
              messageIndex: i,
              phoneNumber: phone,
              contactName: row?.name || row?.nama || null,
              errorType,
              errorMessage: err.message,
              errorCode,
              retryCount: 0,
              maxRetries: canRetry ? 3 : 0,
              failedAt: new Date().toISOString()
            });
          } catch (emitError) {
            logger.warn(`⚠️ Failed to emit error notification: ${emitError.message}`);
          }
        }

        if (isSessionError) {
          // Hitung sisa nomor yang belum diproses
          const remainingCount = rows.length - (i + 1);
          logger.error(`❌ Session WhatsApp terputus saat proses`);

          // Tambahkan sisa nomor yang belum diproses ke failed count
          resultsSocket.failed += remainingCount;
          resultsSocket.status = "error";

          // Tambahkan detail nomor yang belum diproses ke results
          for (let j = i + 1; j < rows.length; j++) {
            const remainingRow = rows[j];
            const remainingPhone = String(remainingRow["no"]).replace(
              /\D/g,
              ""
            );
            results.push({
              phone: remainingPhone,
              status: "error",
              reason: "Session terputus sebelum pesan dikirim",
            });
          }

          await Blast.upsert({
            messageTemplate,
            totalRecipients: rows.length,
            sentCount: resultsSocket.success,
            failedCount: resultsSocket.failed,
            status: "error",
            userId,
            campaignId,
          });

          emitSocket();
          break;
        }
      }

      emitSocket();

      if (i < rows.length - 1) {
        const delay = randomDelay();
        logger.info(`⏳ Delay sebelum nomor berikutnya: ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // Enhanced file cleanup with error handling
    if (selectTarget !== "input" && filePath) {
      try {
        // Check if file exists before attempting to delete
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          logger.info(`🧹 Excel file deleted: ${filePath}`);
        } else {
          logger.warn(`⚠️ Excel file not found for deletion: ${filePath}`);
        }
      } catch (error) {
        logger.error(
          `❌ Failed to delete Excel file ${filePath}:`,
          error.message
        );
        // Don't throw error, just log it as file cleanup is not critical
      }
    }

    if (resultsSocket.status !== "error") {
      resultsSocket.status = "completed";
      emitSocket();

      await Blast.upsert({
        messageTemplate,
        totalRecipients: rows.length,
        sentCount: results.filter((r) => r.status === "success").length,
        failedCount: results.filter((r) => r.status === "error").length,
        status: "done",
        userId,
        campaignId,
      });

      logger.info(
        `📦 Campaign selesai. Total: ${rows.length} | Sukses: ${resultsSocket.success} | Gagal: ${resultsSocket.failed}`
      );

      // Log detail nomor yang gagal untuk debugging
      const failedNumbers = results.filter((r) => r.status === "error");
      if (failedNumbers.length > 0) {
        logger.info(`📋 Detail nomor yang gagal:`);
        failedNumbers.forEach((failed, index) => {
          logger.info(`   ${index + 1}. ${failed.phone} - ${failed.reason}`);
        });
      }
    }

    const failedNumbers = results.filter((r) => r.status === "error");
    const sessionDisconnectedCount = failedNumbers.filter(
      (r) => r.reason === "Session terputus sebelum pesan dikirim"
    ).length;

    let report = `📦 Campaign selesai. Total: ${rows.length} | Sukses: ${resultsSocket.success} | Gagal: ${resultsSocket.failed}`;

    if (sessionDisconnectedCount > 0) {
      report += `\n⚠️ ${sessionDisconnectedCount} nomor tidak diproses karena session terputus`;
    }

    if (notifyNumber && sock) {
      try {
        logger.info(`📲 Mengirim notifikasi ke ${notifyNumber}`);
        await withTimeout(
          sock.sendMessage(`${notifyNumber}@s.whatsapp.net`, {
            text: report,
          })
        );
        logger.info(`✅ Notifikasi berhasil dikirim ke ${notifyNumber}`);
      } catch (err) {
        logger.error(
          `❌ Gagal kirim notifikasi ke ${notifyNumber}: ${err.message}`
        );
      }
    } else {
      logger.warn(
        `⚠️ Tidak bisa kirim notifikasi. Session ${sessionId} tidak aktif atau notifyNumber kosong`
      );
    }
    return results;
  } catch (error) {
    logger.error("💥 Fatal error in processExcelAndSendMessages:", {
      message: error.message,
      stack: error.stack,
      sessionId,
      userId,
      selectTarget,
    });

    // Emit error status
    const io = getSocket();
    if (io) {
      io.emit("blast-status", {
        id: `campaign-${Date.now()}-${notifyNumber}`,
        status: "error",
        progress: 0,
        success: 0,
        failed: 0,
        total: 0,
        userId,
        error: error.message,
      });
    }

    throw error; // Re-throw untuk di-handle di controller
  }
}

module.exports = { processExcelAndSendMessages };
