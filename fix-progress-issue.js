/**
 * Script sederhana untuk memperbaiki masalah progress yang tidak 100% pada session COMPLETED
 * Jalankan dari dalam direktori whatsapp
 */

require("dotenv").config();

const BlastSession = require("./models/blastSessionModel");
const messageQueueHandler = require("./utils/messageQueueHandler");
const logger = require("./utils/logger");

const fixProgressIssue = async () => {
  try {
    console.log("🔍 Mencari session COMPLETED dengan progress < 100%...");

    // Cari session yang COMPLETED tapi progress belum 100%
    const incompleteSessions = await BlastSession.findAll({
      where: {
        status: "COMPLETED",
        progressPercentage: {
          [require("sequelize").Op.lt]: 100,
        },
      },
      order: [["completedAt", "DESC"]],
    });

    console.log(
      `📊 Ditemukan ${incompleteSessions.length} session yang perlu diperbaiki`
    );

    if (incompleteSessions.length === 0) {
      console.log("✅ Tidak ada session yang perlu diperbaiki!");
      return;
    }

    // Perbaiki setiap session
    for (const session of incompleteSessions) {
      console.log(`\n🔧 Memperbaiki session: ${session.sessionId}`);
      console.log(`   Campaign: ${session.campaignName}`);
      console.log(`   Progress saat ini: ${session.progressPercentage}%`);

      try {
        // Dapatkan statistik queue yang sebenarnya
        const queueStats = await messageQueueHandler.getQueueStats(
          session.sessionId
        );

        console.log(
          `   Queue stats: Total=${queueStats.total}, Sent=${queueStats.sent}, Failed=${queueStats.failed}, Remaining=${queueStats.remaining}`
        );

        // Jika tidak ada message yang tersisa, set progress ke 100%
        if (queueStats.remaining === 0) {
          await session.update({
            progressPercentage: 100.0,
            sentCount: queueStats.sent,
            failedCount: queueStats.failed,
            skippedCount: queueStats.skipped || 0,
            updatedAt: new Date(),
          });

          console.log(`   ✅ Progress diupdate ke 100%`);
        } else {
          // Hitung progress yang benar
          const correctProgress =
            queueStats.total > 0
              ? ((queueStats.sent + queueStats.failed + queueStats.skipped) /
                  queueStats.total) *
                100
              : 100;

          await session.update({
            progressPercentage: correctProgress,
            sentCount: queueStats.sent,
            failedCount: queueStats.failed,
            skippedCount: queueStats.skipped || 0,
            updatedAt: new Date(),
          });

          console.log(
            `   ⚠️ Progress diupdate ke ${correctProgress.toFixed(
              2
            )}% (masih ada ${queueStats.remaining} message tersisa)`
          );
        }
      } catch (error) {
        console.error(
          `   ❌ Error memperbaiki session ${session.sessionId}:`,
          error.message
        );
      }
    }

    console.log("\n🎉 Selesai memperbaiki session!");
  } catch (error) {
    console.error("❌ Error dalam script perbaikan:", error);
    logger.error("Fix progress error:", error);
  }
};

// Jalankan perbaikan
console.log("🚀 Memulai perbaikan progress session...");
fixProgressIssue()
  .then(() => {
    console.log("👋 Script selesai");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Script gagal:", error);
    process.exit(1);
  });
