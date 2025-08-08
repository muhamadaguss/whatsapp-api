const MessageTypeClassifier = require("./utils/messageTypeClassifier");

// Test script untuk menguji Message Type Classifier
async function testMessageClassifier() {
  console.log("🧪 Testing Message Type Classifier...\n");

  const classifier = new MessageTypeClassifier();

  // Test messages untuk setiap kategori
  const testMessages = [
    // Promo messages
    {
      message:
        "🔥 FLASH SALE! Diskon 50% untuk semua produk! Buruan sebelum kehabisan!",
      expected: "Promo",
    },
    {
      message:
        "Special offer just for you! Get 30% off on your next purchase. Limited time only!",
      expected: "Promo",
    },
    {
      message:
        "Promo cashback 100rb untuk pembelian minimal Rp 500.000. Jangan sampai terlewat!",
      expected: "Promo",
    },

    // Updates messages
    {
      message:
        "Update sistem terbaru: Fitur chat baru telah tersedia di aplikasi versi 2.1",
      expected: "Updates",
    },
    {
      message:
        "Important announcement: Our website will undergo maintenance tonight from 11 PM to 3 AM",
      expected: "Updates",
    },
    {
      message:
        "Info terbaru: Layanan delivery kini tersedia 24 jam untuk area Jakarta",
      expected: "Updates",
    },

    // Reminder messages
    {
      message:
        "Reminder: Pembayaran tagihan Anda jatuh tempo dalam 3 hari. Mohon segera lakukan pembayaran.",
      expected: "Reminder",
    },
    {
      message:
        "Don't forget! Your subscription expires tomorrow. Please renew to continue using our service.",
      expected: "Reminder",
    },
    {
      message:
        "Pengingat: Deadline pengumpulan dokumen adalah besok pukul 17:00 WIB",
      expected: "Reminder",
    },

    // Welcome messages
    {
      message:
        "Selamat datang di aplikasi kami! Terima kasih telah bergabung dengan komunitas pengguna setia.",
      expected: "Welcome",
    },
    {
      message:
        "Welcome aboard! Thank you for joining our platform. Let's get you started with a quick tour.",
      expected: "Welcome",
    },
    {
      message:
        "Halo! Akun Anda telah berhasil diaktivasi. Selamat menikmati layanan kami!",
      expected: "Welcome",
    },

    // Support messages
    {
      message: "Bagaimana cara mengubah password akun saya? Mohon bantuannya.",
      expected: "Support",
    },
    {
      message:
        "I'm having trouble with the payment process. Can you help me troubleshoot this issue?",
      expected: "Support",
    },
    {
      message:
        "Customer service: Untuk bantuan lebih lanjut, silakan hubungi tim support kami",
      expected: "Support",
    },

    // Edge cases
    {
      message: "",
      expected: "Support",
    },
    {
      message: "Test message without clear category indicators",
      expected: "Support",
    },
  ];

  let correctPredictions = 0;
  const results = [];

  console.log("📊 Testing individual messages:\n");

  testMessages.forEach((test, index) => {
    const result = classifier.classifyWithDetails(test.message);
    const isCorrect = result.category === test.expected;

    if (isCorrect) correctPredictions++;

    results.push({
      index: index + 1,
      message:
        test.message.substring(0, 60) + (test.message.length > 60 ? "..." : ""),
      expected: test.expected,
      predicted: result.category,
      confidence: result.confidence,
      correct: isCorrect,
      matchedKeywords: result.matchedKeywords,
      matchedPatterns: result.matchedPatterns,
    });

    console.log(
      `${index + 1}. ${isCorrect ? "✅" : "❌"} Expected: ${
        test.expected
      }, Got: ${result.category} (${result.confidence}%)`
    );
    console.log(
      `   Message: "${test.message.substring(0, 80)}${
        test.message.length > 80 ? "..." : ""
      }"`
    );
    if (result.matchedKeywords.length > 0) {
      console.log(`   Keywords: ${result.matchedKeywords.join(", ")}`);
    }
    if (result.matchedPatterns.length > 0) {
      console.log(`   Patterns: ${result.matchedPatterns.length} matched`);
    }
    console.log("");
  });

  // Summary
  const accuracy = ((correctPredictions / testMessages.length) * 100).toFixed(
    1
  );
  console.log("📈 Classification Summary:");
  console.log(`   Total tests: ${testMessages.length}`);
  console.log(`   Correct predictions: ${correctPredictions}`);
  console.log(`   Accuracy: ${accuracy}%\n`);

  // Category distribution
  const categoryCount = {};
  results.forEach((result) => {
    categoryCount[result.predicted] =
      (categoryCount[result.predicted] || 0) + 1;
  });

  console.log("📊 Predicted category distribution:");
  Object.entries(categoryCount).forEach(([category, count]) => {
    console.log(`   ${category}: ${count} messages`);
  });

  // Show misclassified messages
  const misclassified = results.filter((r) => !r.correct);
  if (misclassified.length > 0) {
    console.log("\n❌ Misclassified messages:");
    misclassified.forEach((result) => {
      console.log(
        `   ${result.index}. Expected: ${result.expected}, Got: ${result.predicted}`
      );
      console.log(`      "${result.message}"`);
    });
  }

  console.log("\n🎉 Classifier testing completed!");
}

// Test classifier configuration
async function testClassifierConfig() {
  console.log("\n🔧 Testing Classifier Configuration...\n");

  const classifier = new MessageTypeClassifier();

  Object.entries(classifier.categories).forEach(([category, config]) => {
    console.log(`📂 ${category}:`);
    console.log(`   Keywords: ${config.keywords.length} items`);
    console.log(`   Patterns: ${config.patterns.length} items`);
    console.log(
      `   Sample keywords: ${config.keywords.slice(0, 5).join(", ")}`
    );
    console.log("");
  });
}

// Run tests
async function runAllTests() {
  await testClassifierConfig();
  await testMessageClassifier();
}

// Execute if run directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = {
  testMessageClassifier,
  testClassifierConfig,
  runAllTests,
};
