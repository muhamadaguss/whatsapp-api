/**
 * Test script untuk melihat bagaimana persentase dihitung saat ada message yang gagal
 */

// Simulasi data blast session
const testCalculatePercentage = () => {
  console.log("=== Test Perhitungan Persentase ===\n");

  // Test case 1: 5 data total, 1 berhasil, 4 gagal
  const case1 = {
    totalMessages: 5,
    sentCount: 1,
    failedCount: 4,
    skippedCount: 0
  };

  const processed1 = case1.sentCount + case1.failedCount + case1.skippedCount;
  const percentage1 = (processed1 / case1.totalMessages) * 100;

  console.log("Test Case 1 - 5 data total, 1 berhasil, 4 gagal:");
  console.log(`  Total: ${case1.totalMessages}`);
  console.log(`  Sent: ${case1.sentCount}`);  
  console.log(`  Failed: ${case1.failedCount}`);
  console.log(`  Skipped: ${case1.skippedCount}`);
  console.log(`  Processed: ${processed1}`);
  console.log(`  Percentage: ${percentage1}%`);
  console.log(`  Expected: 100% (karena semua 5 data sudah diproses)\n`);

  // Test case 2: 10 data total, 3 berhasil, 2 gagal, 5 belum diproses
  const case2 = {
    totalMessages: 10,
    sentCount: 3,
    failedCount: 2,
    skippedCount: 0
  };

  const processed2 = case2.sentCount + case2.failedCount + case2.skippedCount;
  const percentage2 = (processed2 / case2.totalMessages) * 100;

  console.log("Test Case 2 - 10 data total, 3 berhasil, 2 gagal, 5 belum diproses:");
  console.log(`  Total: ${case2.totalMessages}`);
  console.log(`  Sent: ${case2.sentCount}`);
  console.log(`  Failed: ${case2.failedCount}`);
  console.log(`  Skipped: ${case2.skippedCount}`);
  console.log(`  Processed: ${processed2}`);
  console.log(`  Percentage: ${percentage2}%`);
  console.log(`  Expected: 50% (karena 5 dari 10 data sudah diproses)\n`);

  // Test case 3: Status real-time update
  console.log("Test Case 3 - Real-time progression:");
  const totalData = 5;
  let sent = 0, failed = 0;

  for (let i = 1; i <= totalData; i++) {
    // Simulasi: index 1 berhasil, index 2-5 gagal
    if (i === 1) {
      sent++;
      console.log(`  Processing message ${i}: SUCCESS - Progress: ${((sent + failed) / totalData * 100)}%`);
    } else {
      failed++;
      console.log(`  Processing message ${i}: FAILED - Progress: ${((sent + failed) / totalData * 100)}%`);
    }
  }

  console.log(`\nFinal result: ${sent} sent, ${failed} failed = ${sent + failed}/${totalData} (${(sent + failed) / totalData * 100}%)`);
};

// Jalankan test
testCalculatePercentage();

module.exports = { testCalculatePercentage };
