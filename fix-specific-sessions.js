/**
 * Script untuk memperbaiki session-session yang bermasalah
 */

require("dotenv").config();

const BlastSession = require("./models/blastSessionModel");
const messageQueueHandler = require("./utils/messageQueueHandler");

const fixSpecificSessions = async () => {
  try {
    console.log("🔧 Memperbaiki session-session yang bermasalah...");

    // Session yang bermasalah berdasarkan hasil check
    const problematicSessions = [
      "blast_1756355715559_ty9sbr", // Progress 300%
      "blast_1756199611165_0eyxtqf", // Progress 50% tapi seharusnya 100%
      "blast_1756031604783_k9wpy", // Progress 0% tapi seharusnya 100%
    ];

    for (const sessionId of problematicSessions) {
      console.log(`\n🔧 Memperbaiki session: ${sessionId}`);

      try {
        const session = await BlastSession.findOne({ where: { sessionId } });
        if (!session) {
          console.log(`   ❌ Session tidak ditemukan`);
          continue;
        }

        console.log(`   Campaign: ${session.campaignName}`);
        console.log(`   Status: ${session.status}`);
        console.log(`   Progress saat ini: ${session.progressPercentage}%`);

        // Dapatkan queue stats
        const queueStats = await messageQueueHandler.getQueueStats(sessionId);
        console.log(
          `   Queue stats: Total=${queueStats.total}, Sent=${queueStats.sent}, Failed=${queueStats.failed}, Remaining=${queueStats.remaining}`
        );

        // Hitung progress yang benar
        const correctProgress =
          queueStats.total > 0
            ? ((queueStats.sent + queueStats.failed + queueStats.skipped) /
                queueStats.total) *
              100
            : 100;

        console.log(`   Progress yang benar: ${correctProgress.toFixed(2)}%`);

        // Update session
        await session.update({
          progressPercentage: correctProgress,
          sentCount: queueStats.sent,
          failedCount: queueStats.failed,
          skippedCount: queueStats.skipped || 0,
          updatedAt: new Date(),
        });

        console.log(`   ✅ Session berhasil diperbaiki`);
      } catch (error) {
        console.error(
          `   ❌ Error memperbaiki session ${sessionId}:`,
          error.message
        );
      }
    }

    console.log("\n🎉 Selesai memperbaiki session!");

    // Cek hasil perbaikan
    console.log("\n📊 Hasil perbaikan:");
    for (const sessionId of problematicSessions) {
      try {
        const session = await BlastSession.findOne({ where: { sessionId } });
        if (session) {
          console.log(`   ${sessionId}: ${session.progressPercentage}%`);
        }
      } catch (error) {
        console.log(`   ${sessionId}: Error - ${error.message}`);
      }
    }
  } catch (error) {
    console.error("❌ Error:", error);
  }
};

console.log("🚀 Memulai perbaikan session bermasalah...");
fixSpecificSessions()
  .then(() => {
    console.log("\n👋 Selesai");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });
