#!/usr/bin/env node

require("dotenv").config();
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

console.log("🧪 Testing JWT Generation...\n");

// Test JWT generation dengan konfigurasi yang diperbaiki
const testTokenPayload = {
  id: 1,
  username: "testuser",
  role: "admin",
  iat: Math.floor(Date.now() / 1000),
  jti: crypto.randomBytes(16).toString("hex"),
};

const testTokenOptions = {
  expiresIn: process.env.JWT_EXPIRES_IN || "12h",
  algorithm: "HS256",
};

try {
  console.log("📝 Token Payload:");
  console.log(JSON.stringify(testTokenPayload, null, 2));

  console.log("\n⚙️ Token Options:");
  console.log(JSON.stringify(testTokenOptions, null, 2));

  console.log("\n🔐 Generating JWT token...");
  const token = jwt.sign(
    testTokenPayload,
    process.env.JWT_SECRET,
    testTokenOptions
  );

  console.log("✅ JWT Token generated successfully!");
  console.log("Token length:", token.length);
  console.log("Token preview:", token.substring(0, 50) + "...");

  // Verify token
  console.log("\n🔍 Verifying token...");
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  console.log("✅ Token verified successfully!");
  console.log("Decoded payload:");
  console.log(JSON.stringify(decoded, null, 2));
} catch (error) {
  console.error("❌ JWT Error:", error.message);
  console.error("Stack:", error.stack);
  process.exit(1);
}

console.log("\n🎉 JWT test completed successfully!");
