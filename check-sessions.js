/**
 * Script untuk melihat semua session dan statusnya
 */

require("dotenv").config();

const BlastSession = require("./models/blastSessionModel");
const messageQueueHandler = require("./utils/messageQueueHandler");

const checkSessions = async () => {
  try {
    console.log("📊 Melihat semua session...");

    const allSessions = await BlastSession.findAll({
      order: [["createdAt", "DESC"]],
      limit: 10, // Ambil 10 session terbaru
    });

    console.log(`\nDitemukan ${allSessions.length} session:`);

    for (const session of allSessions) {
      console.log(`\n📋 Session: ${session.sessionId}`);
      console.log(`   Campaign: ${session.campaignName}`);
      console.log(`   Status: ${session.status}`);
      console.log(`   Progress: ${session.progressPercentage}%`);
      console.log(`   Total Messages: ${session.totalMessages}`);
      console.log(
        `   Sent: ${session.sentCount}, Failed: ${
          session.failedCount
        }, Skipped: ${session.skippedCount || 0}`
      );
      console.log(`   Created: ${session.createdAt}`);
      console.log(`   Completed: ${session.completedAt}`);

      // Cek queue stats jika ada
      try {
        const queueStats = await messageQueueHandler.getQueueStats(
          session.sessionId
        );
        console.log(
          `   Queue: Total=${queueStats.total}, Sent=${queueStats.sent}, Failed=${queueStats.failed}, Remaining=${queueStats.remaining}`
        );

        // Cek apakah ada ketidaksesuaian
        if (session.status === "COMPLETED" && queueStats.remaining > 0) {
          console.log(
            `   ⚠️ MASALAH: Status COMPLETED tapi masih ada ${queueStats.remaining} message tersisa`
          );
        }

        if (
          session.status === "COMPLETED" &&
          session.progressPercentage < 100
        ) {
          console.log(
            `   ⚠️ MASALAH: Status COMPLETED tapi progress hanya ${session.progressPercentage}%`
          );
        }

        const expectedProgress =
          queueStats.total > 0
            ? ((queueStats.sent + queueStats.failed + queueStats.skipped) /
                queueStats.total) *
              100
            : 100;

        if (Math.abs(session.progressPercentage - expectedProgress) > 0.1) {
          console.log(
            `   ⚠️ MASALAH: Progress tidak sesuai. Expected: ${expectedProgress.toFixed(
              2
            )}%, Actual: ${session.progressPercentage}%`
          );
        }
      } catch (error) {
        console.log(`   ❌ Error getting queue stats: ${error.message}`);
      }
    }
  } catch (error) {
    console.error("❌ Error:", error);
  }
};

console.log("🔍 Mengecek status session...");
checkSessions()
  .then(() => {
    console.log("\n👋 Selesai");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });
