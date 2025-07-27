const axios = require("axios");

// Test script untuk endpoint chart baru
async function testChartEndpoints() {
  const baseURL = "http://localhost:3000"; // Sesuaikan dengan port backend Anda

  // Dummy token untuk testing - ganti dengan token valid
  const token = "your-jwt-token-here";

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  try {
    console.log("🧪 Testing Message Trends endpoint...");
    const trendsResponse = await axios.post(
      `${baseURL}/campaign/getMessageTrends`,
      {
        period: "monthly",
      },
      { headers }
    );

    console.log(
      "✅ Message Trends Response:",
      JSON.stringify(trendsResponse.data, null, 2)
    );

    console.log("\n🧪 Testing Message Type Performance endpoint...");
    const performanceResponse = await axios.post(
      `${baseURL}/campaign/getMessageTypePerformance`,
      {
        period: "monthly",
      },
      { headers }
    );

    console.log(
      "✅ Message Type Performance Response:",
      JSON.stringify(performanceResponse.data, null, 2)
    );
  } catch (error) {
    console.error(
      "❌ Error testing endpoints:",
      error.response?.data || error.message
    );
  }
}

// Jalankan test
testChartEndpoints();
