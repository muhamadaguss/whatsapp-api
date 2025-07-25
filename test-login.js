#!/usr/bin/env node

require("dotenv").config();
const axios = require("axios");

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:3000";

async function testLogin() {
  console.log("🧪 Testing Login API...\n");

  const loginData = {
    username: "admin", // Ganti dengan username yang valid
    password: "admin123", // Ganti dengan password yang valid
  };

  try {
    console.log("📝 Login Request:");
    console.log(`URL: ${API_BASE_URL}/api/auth/login`);
    console.log("Data:", JSON.stringify(loginData, null, 2));

    console.log("\n🔐 Sending login request...");
    const response = await axios.post(
      `${API_BASE_URL}/api/auth/login`,
      loginData,
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );

    console.log("✅ Login successful!");
    console.log("Status:", response.status);
    console.log("Response:");
    console.log(JSON.stringify(response.data, null, 2));

    // Test token verification
    if (response.data.token) {
      console.log("\n🔍 Testing token verification...");
      const verifyResponse = await axios.get(
        `${API_BASE_URL}/api/auth/verify`,
        {
          headers: {
            Authorization: `Bearer ${response.data.token}`,
          },
        }
      );

      console.log("✅ Token verification successful!");
      console.log("Verify Response:");
      console.log(JSON.stringify(verifyResponse.data, null, 2));
    }
  } catch (error) {
    console.error("❌ Login Error:");
    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Response:", JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.error("No response received:", error.message);
    } else {
      console.error("Request error:", error.message);
    }
    process.exit(1);
  }

  console.log("\n🎉 Login test completed successfully!");
}

// Check if server is running first
async function checkServer() {
  try {
    const response = await axios.get(`${API_BASE_URL}/health`, {
      timeout: 5000,
    });
    console.log("✅ Server is running");
    return true;
  } catch (error) {
    console.error("❌ Server is not running or not accessible");
    console.error("Please start the server first with: npm start");
    return false;
  }
}

async function main() {
  console.log("🏥 Checking server status...");
  const serverRunning = await checkServer();

  if (serverRunning) {
    await testLogin();
  }
}

main().catch(console.error);
