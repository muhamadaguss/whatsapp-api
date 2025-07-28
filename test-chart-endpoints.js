const axios = require("axios");

// Test script untuk endpoint chart baru (PostgreSQL compatible)
async function testChartEndpoints() {
  const baseURL = "http://localhost:3000"; // Sesuaikan dengan port backend Anda

  // Dummy token untuk testing - ganti dengan token valid
  const token = "your-jwt-token-here";

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const periods = ["today", "weekly", "monthly"];

  for (const period of periods) {
    try {
      console.log(
        `\n🧪 Testing Message Trends endpoint for period: ${period}...`
      );
      const trendsResponse = await axios.post(
        `${baseURL}/campaign/getMessageTrends`,
        {
          period: period,
        },
        { headers }
      );

      console.log(
        `✅ Message Trends Response (${period}):`,
        JSON.stringify(trendsResponse.data, null, 2)
      );

      console.log(
        `\n🧪 Testing Message Type Performance endpoint for period: ${period}...`
      );
      const performanceResponse = await axios.post(
        `${baseURL}/campaign/getMessageTypePerformance`,
        {
          period: period,
        },
        { headers }
      );

      console.log(
        `✅ Message Type Performance Response (${period}):`,
        JSON.stringify(performanceResponse.data, null, 2)
      );
    } catch (error) {
      console.error(
        `❌ Error testing endpoints for period ${period}:`,
        error.response?.data || error.message
      );
    }
  }
}

// Test individual endpoint
async function testSingleEndpoint(endpoint, period = "monthly") {
  const baseURL = "http://localhost:3000";
  const token = "your-jwt-token-here";

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  try {
    console.log(`🧪 Testing ${endpoint} endpoint...`);
    const response = await axios.post(
      `${baseURL}/campaign/${endpoint}`,
      {
        period: period,
      },
      { headers }
    );

    console.log(
      `✅ ${endpoint} Response:`,
      JSON.stringify(response.data, null, 2)
    );
  } catch (error) {
    console.error(
      `❌ Error testing ${endpoint}:`,
      error.response?.data || error.message
    );
  }
}

// Jalankan test
if (process.argv[2] === "single") {
  const endpoint = process.argv[3] || "getMessageTrends";
  const period = process.argv[4] || "monthly";
  testSingleEndpoint(endpoint, period);
} else {
  testChartEndpoints();
}

// Usage:
// node test-chart-endpoints.js                                    // Test all endpoints for all periods
// node test-chart-endpoints.js single getMessageTrends today      // Test single endpoint for specific period
