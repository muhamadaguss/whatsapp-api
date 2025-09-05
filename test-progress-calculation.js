/**
 * Script untuk test progress calculation yang sudah diperbaiki
 */

require("dotenv").config();

const BlastSession = require("./models/blastSessionModel");
const messageQueueHandler = require("./utils/messageQueueHandler");

const testProgressCalculation = async () => {
  try {
    console.log("🧪 Testing progress calculation...");

    // Ambil session terbaru untuk test
    const latestSession = await BlastSession.findOne({
      order: [["createdAt", "DESC"]],
    });

    if (!latestSession) {
      console.log("❌ Tidak ada session untuk di-test");
      return;
    }

    console.log(`\n📋 Testing session: ${latestSession.sessionId}`);
    console.log(`   Campaign: ${latestSession.campaignName}`);
    console.log(`   Status: ${latestSession.status}`);

    // Test progress calculation
    const queueStats = await messageQueueHandler.getQueueStats(
      latestSession.sessionId
    );

    console.log("\n📊 Current Data:");
    console.log(`   Session Progress: ${latestSession.progressPercentage}%`);
    console.log(
      `   Session Counts: Sent=${latestSession.sentCount}, Failed=${
        latestSession.failedCount
      }, Skipped=${latestSession.skippedCount || 0}`
    );
    console.log(
      `   Queue Stats: Total=${queueStats.total}, Sent=${queueStats.sent}, Failed=${queueStats.failed}, Skipped=${queueStats.skipped}, Remaining=${queueStats.remaining}`
    );

    // Calculate expected progress
    const totalProcessed =
      queueStats.sent + queueStats.failed + queueStats.skipped;
    const expectedProgress =
      queueStats.total > 0
        ? Math.min(100, (totalProcessed / queueStats.total) * 100)
        : 0;

    console.log("\n🧮 Progress Calculation:");
    console.log(
      `   Total Processed: ${totalProcessed} (${queueStats.sent} sent + ${queueStats.failed} failed + ${queueStats.skipped} skipped)`
    );
    console.log(`   Total Messages: ${queueStats.total}`);
    console.log(`   Expected Progress: ${expectedProgress.toFixed(2)}%`);
    console.log(`   Current Progress: ${latestSession.progressPercentage}%`);

    // Check if calculation is correct
    const isCorrect =
      Math.abs(latestSession.progressPercentage - expectedProgress) < 0.1;
    console.log(`   Calculation Correct: ${isCorrect ? "✅ YES" : "❌ NO"}`);

    if (!isCorrect) {
      console.log(
        `   Difference: ${Math.abs(
          latestSession.progressPercentage - expectedProgress
        ).toFixed(2)}%`
      );
    }

    // Test edge cases
    console.log("\n🔍 Edge Case Tests:");

    // Test 1: Progress should never exceed 100%
    if (latestSession.progressPercentage > 100) {
      console.log("   ❌ FAIL: Progress exceeds 100%");
    } else {
      console.log("   ✅ PASS: Progress does not exceed 100%");
    }

    // Test 2: If all messages processed, progress should be 100%
    if (queueStats.remaining === 0 && queueStats.total > 0) {
      if (Math.abs(expectedProgress - 100) < 0.1) {
        console.log("   ✅ PASS: All messages processed, progress is 100%");
      } else {
        console.log(
          "   ❌ FAIL: All messages processed but progress is not 100%"
        );
      }
    }

    // Test 3: Progress should match queue statistics
    const sessionTotal =
      latestSession.sentCount +
      latestSession.failedCount +
      (latestSession.skippedCount || 0);
    const queueTotal = queueStats.sent + queueStats.failed + queueStats.skipped;

    if (sessionTotal === queueTotal) {
      console.log("   ✅ PASS: Session counts match queue statistics");
    } else {
      console.log("   ❌ FAIL: Session counts do not match queue statistics");
      console.log(
        `     Session Total: ${sessionTotal}, Queue Total: ${queueTotal}`
      );
    }

    console.log("\n📋 Summary:");
    if (isCorrect && latestSession.progressPercentage <= 100) {
      console.log("   ✅ Progress calculation is working correctly!");
    } else {
      console.log("   ❌ Progress calculation needs attention");

      if (latestSession.progressPercentage > 100) {
        console.log("   - Progress exceeds 100% (should be capped)");
      }

      if (!isCorrect) {
        console.log("   - Progress does not match expected calculation");
      }
    }
  } catch (error) {
    console.error("❌ Error:", error);
  }
};

console.log("🚀 Starting progress calculation test...");
testProgressCalculation()
  .then(() => {
    console.log("\n👋 Test completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Test failed:", error);
    process.exit(1);
  });
