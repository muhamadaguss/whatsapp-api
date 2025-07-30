const fs = require("fs");
const xlsx = require("xlsx");
const { getSock } = require("../auth/session");
const Blast = require("../models/blastModel");
const logger = require("../utils/logger"); // Mengimpor logger
const MessageStatusModel = require("../models/messageStatusModel");
const { getSocket } = require("../auth/socket");
const Boom = require("@hapi/boom");

function randomDelay(min = 60, max = 120) {
  return Math.floor(Math.random() * (max - min + 1) + min) * 1000;
}

function replaceVariablesInMessage(template, data) {
  const regex = /\{(\w+)\}/g;
  return template.replace(regex, (_, variableName) => {
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

    logger.info(
      `🚀 Mulai proses blast dengan sessionId: ${sessionId}, total kontak: ${rows.length}`
    );

    function emitSocket() {
      resultsSocket.progress = Math.min(
        100,
        Math.round(
          ((resultsSocket.success + resultsSocket.failed) /
            resultsSocket.total) *
            100
        )
      );
      io?.emit("blast-status", resultsSocket);
      logger.info(
        `📡 Emit status: ${resultsSocket.progress}% | Success: ${resultsSocket.success} | Failed: ${resultsSocket.failed}`
      );
    }

    async function emitFailure(reason, total) {
      logger.error(`❌ ${reason}`);
      await Blast.upsert({
        messageTemplate,
        totalRecipients: total,
        sentCount: 0,
        failedCount: total,
        status: "error",
        userId,
        campaignId,
      });
      resultsSocket.failed = total;
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

        results.push({ phone, status: "success", messageId: sentMsg.key.id });
        resultsSocket.success++;
      } catch (err) {
        const isSessionError =
          /not connected|disconnected|logout|terminated|conn|closed/i.test(
            err.message
          );
        const isTimeoutError =
          Boom.isBoom(err) && err.output?.statusCode === 408;

        logger.error(`❌ Gagal kirim ke ${phone}: ${err.message}`);

        if (isTimeoutError) {
          logger.warn(`⚠️ Timeout saat proses nomor ${phone}, akan di-skip`);
          results.push({
            phone,
            status: "error",
            reason: "Timeout saat verifikasi nomor",
          });
          resultsSocket.failed++;
          emitSocket();
          continue; // skip dan lanjut ke nomor berikutnya
        }

        results.push({ phone, status: "error", reason: err.message });
        resultsSocket.failed++;

        if (isSessionError) {
          await emitFailure(
            `Session WhatsApp terputus saat proses`,
            rows.length
          );
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
    }

    const report = `📦 Campaign selesai. Total: ${rows.length} | Sukses: ${resultsSocket.success} | Gagal: ${resultsSocket.failed}`;

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
