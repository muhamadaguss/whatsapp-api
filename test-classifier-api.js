const axios = require("axios");

// Test script untuk API classifier endpoints
async function testClassifierAPI() {
  const baseURL = "http://localhost:3000";
  const token = "your-jwt-token-here"; // Ganti dengan token valid

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  console.log("🧪 Testing Classifier API Endpoints...\n");

  try {
    // 1. Test single message classification
    console.log("1️⃣ Testing single message classification...");
    const singleTestResponse = await axios.post(
      `${baseURL}/classifier/test`,
      {
        message:
          "🔥 FLASH SALE! Diskon 50% untuk semua produk elektronik! Buruan sebelum kehabisan stock!",
      },
      { headers }
    );

    console.log("✅ Single message test result:");
    console.log(JSON.stringify(singleTestResponse.data, null, 2));
    console.log("");

    // 2. Test batch classification
    console.log("2️⃣ Testing batch message classification...");
    const batchMessages = [
      "Promo cashback 100rb untuk pembelian minimal Rp 500.000",
      "Update sistem: Fitur chat baru telah tersedia di versi 2.1",
      "Reminder: Pembayaran tagihan Anda jatuh tempo dalam 3 hari",
      "Selamat datang! Terima kasih telah bergabung dengan platform kami",
      "Bagaimana cara mengubah password akun saya? Mohon bantuannya",
      "Special offer just for you! Get 30% off on your next purchase",
      "Important announcement: Server maintenance tonight 11 PM - 3 AM",
      "Don't forget! Your subscription expires tomorrow",
      "Welcome aboard! Let's get you started with a quick tour",
      "I need help with the payment process. Can you assist me?",
    ];

    const batchTestResponse = await axios.post(
      `${baseURL}/classifier/batch-test`,
      {
        messages: batchMessages,
      },
      { headers }
    );

    console.log("✅ Batch test results:");
    console.log(`Total messages: ${batchTestResponse.data.data.summary.total}`);
    console.log("Category distribution:");
    Object.entries(batchTestResponse.data.data.summary.byCategory).forEach(
      ([category, count]) => {
        console.log(`  ${category}: ${count} messages`);
      }
    );
    console.log("");

    // Show detailed results for each message
    console.log("📊 Detailed classification results:");
    batchTestResponse.data.data.results.forEach((result, index) => {
      const classification = result.classification;
      console.log(
        `${index + 1}. ${classification.category} (${
          classification.confidence
        }%)`
      );
      console.log(
        `   Message: "${result.message.substring(0, 60)}${
          result.message.length > 60 ? "..." : ""
        }"`
      );
      if (classification.matchedKeywords.length > 0) {
        console.log(
          `   Keywords: ${classification.matchedKeywords.join(", ")}`
        );
      }
      console.log("");
    });

    // 3. Test classifier configuration
    console.log("3️⃣ Testing classifier configuration...");
    const configResponse = await axios.get(`${baseURL}/classifier/config`, {
      headers,
    });

    console.log("✅ Classifier configuration:");
    console.log(
      `Available categories: ${configResponse.data.data.categories.join(", ")}`
    );
    console.log("");

    Object.entries(configResponse.data.data.config).forEach(
      ([category, config]) => {
        console.log(`📂 ${category}:`);
        console.log(`   Keywords: ${config.keywordCount} items`);
        console.log(`   Patterns: ${config.patternCount} items`);
        console.log(`   Sample keywords: ${config.sampleKeywords.join(", ")}`);
        console.log("");
      }
    );

    console.log("🎉 All classifier API tests completed successfully!");
  } catch (error) {
    console.error("❌ Error testing classifier API:");
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Data:`, error.response.data);
    } else {
      console.error(error.message);
    }
  }
}

// Test individual endpoints
async function testSingleEndpoint(endpoint, data = {}) {
  const baseURL = "http://localhost:3000";
  const token = "your-jwt-token-here";

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  try {
    console.log(`🧪 Testing ${endpoint} endpoint...`);

    let response;
    if (endpoint === "config") {
      response = await axios.get(`${baseURL}/classifier/${endpoint}`, {
        headers,
      });
    } else {
      response = await axios.post(`${baseURL}/classifier/${endpoint}`, data, {
        headers,
      });
    }

    console.log("✅ Response:");
    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error(
      `❌ Error testing ${endpoint}:`,
      error.response?.data || error.message
    );
  }
}

// Usage examples
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args[0] === "single") {
    // Test single endpoint
    const endpoint = args[1] || "test";
    const sampleData = {
      test: {
        message: "Promo spesial hari ini! Diskon 50% untuk semua produk!",
      },
      "batch-test": {
        messages: [
          "Flash sale 70% off!",
          "System update available",
          "Payment reminder: due tomorrow",
        ],
      },
    };

    testSingleEndpoint(endpoint, sampleData[endpoint] || {});
  } else {
    // Test all endpoints
    testClassifierAPI();
  }
}

// Export for use in other scripts
module.exports = {
  testClassifierAPI,
  testSingleEndpoint,
};

/*
Usage:
node test-classifier-api.js                    // Test all endpoints
node test-classifier-api.js single test        // Test single message endpoint
node test-classifier-api.js single batch-test  // Test batch endpoint
node test-classifier-api.js single config      // Test config endpoint
*/
