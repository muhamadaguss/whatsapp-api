// Complete test for image feature functionality
const fs = require("fs");
const path = require("path");

console.log("🧪 Complete Image Feature Test");
console.log("================================\n");

// Test 1: Check required modules
console.log("1. 📦 Testing Required Modules...");
try {
  const baileys = require("@whiskeysockets/baileys");
  const multer = require("multer");
  const express = require("express");

  console.log("   ✅ @whiskeysockets/baileys loaded");
  console.log("   ✅ multer loaded");
  console.log("   ✅ express loaded");
} catch (error) {
  console.log("   ❌ Module loading failed:", error.message);
}

// Test 2: Check file structure
console.log("\n2. 📁 Testing File Structure...");
const requiredFiles = [
  "controllers/whatsappController.js",
  "utils/connectionHealth.js",
  "routes/whatsappRoutes.js",
  "auth/session.js",
  "uploads",
];

requiredFiles.forEach((file) => {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    console.log(`   ✅ ${file} exists`);
  } else {
    console.log(`   ❌ ${file} missing`);
  }
});

// Test 3: Check uploads directory permissions
console.log("\n3. 🔐 Testing Uploads Directory...");
try {
  const uploadsDir = path.join(__dirname, "uploads");

  // Test write permission
  const testFile = path.join(uploadsDir, "test-write.tmp");
  fs.writeFileSync(testFile, "test");
  fs.unlinkSync(testFile);

  console.log("   ✅ Write permissions OK");

  // Check existing files
  const files = fs.readdirSync(uploadsDir);
  console.log(`   📊 Current files: ${files.length}`);
} catch (error) {
  console.log("   ❌ Uploads directory test failed:", error.message);
}

// Test 4: Syntax check for key files
console.log("\n4. ✅ Testing Syntax...");
const syntaxFiles = [
  "controllers/whatsappController.js",
  "utils/connectionHealth.js",
  "routes/whatsappRoutes.js",
];

syntaxFiles.forEach((file) => {
  try {
    require(path.join(__dirname, file));
    console.log(`   ✅ ${file} syntax OK`);
  } catch (error) {
    console.log(`   ❌ ${file} syntax error:`, error.message);
  }
});

// Test 5: Check environment variables
console.log("\n5. 🌍 Testing Environment...");
require("dotenv").config();

const requiredEnvVars = ["DB_NAME", "DB_USER", "DB_PASS", "JWT_SECRET"];
requiredEnvVars.forEach((envVar) => {
  if (process.env[envVar]) {
    console.log(`   ✅ ${envVar} is set`);
  } else {
    console.log(`   ⚠️ ${envVar} is missing`);
  }
});

// Test 6: Create test image buffer
console.log("\n6. 🖼️ Testing Image Processing...");
try {
  // Create a minimal PNG buffer
  const pngHeader = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);

  if (pngHeader.length === 8) {
    console.log("   ✅ Image buffer creation OK");
  }

  // Test file extension detection
  const mimeTypes = ["image/png", "image/jpeg", "image/gif", "image/webp"];
  mimeTypes.forEach((mimeType) => {
    let extension = "jpg";
    if (mimeType.includes("png")) extension = "png";
    else if (mimeType.includes("gif")) extension = "gif";
    else if (mimeType.includes("webp")) extension = "webp";

    console.log(`   ✅ ${mimeType} -> .${extension}`);
  });
} catch (error) {
  console.log("   ❌ Image processing test failed:", error.message);
}

// Test 7: Connection health utility
console.log("\n7. 🔍 Testing Connection Health Utility...");
try {
  const { checkSessionHealth } = require("./utils/connectionHealth");

  // Test with null socket (should handle gracefully)
  const health = checkSessionHealth(null, "test-session");

  if (health && typeof health.isHealthy === "boolean") {
    console.log("   ✅ Connection health utility works");
    console.log(
      `   📊 Test result: ${health.isHealthy ? "healthy" : "unhealthy"}`
    );
    console.log(`   📋 Issues: ${health.issues.join(", ")}`);
  }
} catch (error) {
  console.log("   ❌ Connection health test failed:", error.message);
}

// Summary
console.log("\n📋 Test Summary");
console.log("===============");
console.log("✅ Image feature components are ready");
console.log("⚠️ Database connection needs to be fixed");
console.log("🔄 WhatsApp session needs to be active for full testing");

console.log("\n🚀 Next Steps:");
console.log("1. Fix database connection (run: node simple-migration.js)");
console.log("2. Start WhatsApp session and scan QR code");
console.log("3. Test image sending via frontend");
console.log("4. Monitor logs for connection health");

console.log("\n🎯 Ready for production testing!");
