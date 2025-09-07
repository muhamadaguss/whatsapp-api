/**
 * Debug script untuk melihat data actual di database saat blast berjalan
 */
require("dotenv").config();
const sequelize = require("./models/db");
const BlastSession = require("./models/blastSessionModel");
const BlastMessage = require("./models/blastMessageModel");

const debugBlastProgress = async () => {
  try {
    console.log("=== Debug Blast Progress ===\n");

    // Ambil semua blast sessions yang ada (tidak hanya aktif)
    const sessions = await BlastSession.findAll({
      order: [["createdAt", "DESC"]],
      limit: 5
    });

    console.log(`Found ${sessions.length} sessions:\n`);

    for (const session of sessions) {
      console.log(`Session: ${session.sessionId}`);
      console.log(`  Campaign: ${session.campaignName}`);
      console.log(`  Status: ${session.status}`);
      console.log(`  Total Messages: ${session.totalMessages}`);
      console.log(`  Current Index: ${session.currentIndex}`);
      console.log(`  Sent Count: ${session.sentCount}`);
      console.log(`  Failed Count: ${session.failedCount}`);
      console.log(`  Skipped Count: ${session.skippedCount}`);
      console.log(`  Progress Percentage: ${session.progressPercentage}%`);

      // Hitung total yang sudah diproses
      const totalProcessed = session.sentCount + session.failedCount + session.skippedCount;
      const calculatedPercentage = session.totalMessages > 0 ? 
        (totalProcessed / session.totalMessages) * 100 : 0;

      console.log(`  Calculated Progress: ${totalProcessed}/${session.totalMessages} = ${calculatedPercentage.toFixed(2)}%`);

      // Ambil statistik dari blast_messages table
      const messageStats = await BlastMessage.findAll({
        where: { sessionId: session.sessionId },
        attributes: ["status", [sequelize.fn("COUNT", "*"), "count"]],
        group: ["status"],
        raw: true,
      });

      console.log(`  Message Stats from DB:`);
      let dbTotal = 0;
      messageStats.forEach(stat => {
        console.log(`    ${stat.status}: ${stat.count}`);
        dbTotal += parseInt(stat.count);
      });

      console.log(`  DB Total: ${dbTotal}`);
      
      // Periksa apakah ada discrepancy
      if (totalProcessed !== (session.sentCount + session.failedCount + session.skippedCount)) {
        console.log(`  ⚠️ DISCREPANCY DETECTED!`);
      }

      if (Math.abs(calculatedPercentage - session.progressPercentage) > 0.1) {
        console.log(`  ⚠️ PERCENTAGE MISMATCH! Calculated: ${calculatedPercentage.toFixed(2)}%, Stored: ${session.progressPercentage}%`);
      }

      console.log("");
    }

  } catch (error) {
    console.error("Error debugging blast progress:", error);
  } finally {
    await sequelize.close();
  }
};

// Jalankan debug
debugBlastProgress();
