// Test script untuk manual cleanup
const FileCleanupManager = require("./utils/fileCleanup");

async function testCleanup() {
  const cleanup = new FileCleanupManager({
    tempFileMaxAge: 24 * 60 * 60 * 1000, // 24 hours
    directories: {
      uploads: "./uploads",
      logs: "./logs",
      sessions: "./sessions",
      temp: "./temp",
    },
    maxFilesToDelete: 50, // Limit untuk testing
    dryRun: false, // ACTUALLY DELETE FILES
  });

  console.log("🧹 Starting manual cleanup...");

  try {
    // Get stats before cleanup
    const statsBefore = await cleanup.getCleanupStats();
    console.log("📊 Before cleanup:");
    console.log(`   Total files: ${statsBefore.totalFiles}`);
    console.log(`   Total size: ${cleanup.formatBytes(statsBefore.totalSize)}`);

    // Run cleanup
    const results = await cleanup.runCleanup();

    console.log("✅ Cleanup completed:");
    console.log(`   Files deleted: ${results.deletedFiles}`);
    console.log(`   Space freed: ${cleanup.formatBytes(results.freedSpace)}`);
    console.log(`   Errors: ${results.errors.length}`);

    if (results.errors.length > 0) {
      console.log("❌ Errors:", results.errors);
    }

    // Get stats after cleanup
    const statsAfter = await cleanup.getCleanupStats();
    console.log("📊 After cleanup:");
    console.log(`   Total files: ${statsAfter.totalFiles}`);
    console.log(`   Total size: ${cleanup.formatBytes(statsAfter.totalSize)}`);
  } catch (error) {
    console.error("❌ Cleanup failed:", error.message);
  }
}

// Run the test
testCleanup();
