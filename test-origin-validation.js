#!/usr/bin/env node

require("dotenv").config();
const SecurityUtils = require("./utils/security");

function testOriginValidation() {
  console.log("🔍 Testing Origin Validation Logic...\n");

  // Get allowed origins
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim())
    : [
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "https://whatsapp-web.jobmarket.my.id",
        "http://localhost:8081",
        "http://127.0.0.1:8081",
      ];

  console.log("📋 Allowed Origins:");
  allowedOrigins.forEach((origin, index) => {
    console.log(`   ${index + 1}. "${origin}"`);
  });

  // Test origins
  const testOrigins = [
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://localhost:8081",
    "https://whatsapp-web.jobmarket.my.id",
    "http://localhost:3000", // Should fail
    "http://example.com", // Should fail
    null, // No origin - should pass
    undefined, // No origin - should pass
  ];

  console.log("\n🧪 Testing Origins:");
  console.log(
    "┌─────────────────────────────────────┬─────────┬─────────────────────┐"
  );
  console.log(
    "│ Origin                              │ Allowed │ Reason              │"
  );
  console.log(
    "├─────────────────────────────────────┼─────────┼─────────────────────┤"
  );

  testOrigins.forEach((origin) => {
    const isAllowed = SecurityUtils.isOriginAllowed(origin, allowedOrigins);
    const displayOrigin = origin || "null/undefined";
    const reason = !origin
      ? "No origin header"
      : isAllowed
      ? "In allowed list"
      : "Not in allowed list";

    const status = isAllowed ? "✅ Yes" : "❌ No";
    const paddedOrigin = displayOrigin.padEnd(35);
    const paddedStatus = status.padEnd(7);
    const paddedReason = reason.padEnd(19);

    console.log(`│ ${paddedOrigin} │ ${paddedStatus} │ ${paddedReason} │`);
  });

  console.log(
    "└─────────────────────────────────────┴─────────┴─────────────────────┘"
  );

  // Check for common issues
  console.log("\n🔍 Common Issues:");

  // Check for trailing slashes
  const hasTrailingSlashes = allowedOrigins.some((origin) =>
    origin.endsWith("/")
  );
  if (hasTrailingSlashes) {
    console.log(
      "   ⚠️ Some origins have trailing slashes - this might cause issues"
    );
  }

  // Check for mixed protocols
  const hasHttp = allowedOrigins.some((origin) => origin.startsWith("http://"));
  const hasHttps = allowedOrigins.some((origin) =>
    origin.startsWith("https://")
  );
  if (hasHttp && hasHttps) {
    console.log(
      "   ℹ️ Mixed HTTP/HTTPS origins detected - ensure frontend uses correct protocol"
    );
  }

  // Check for localhost variations
  const hasLocalhost = allowedOrigins.some((origin) =>
    origin.includes("localhost")
  );
  const has127 = allowedOrigins.some((origin) => origin.includes("127.0.0.1"));
  if (hasLocalhost && has127) {
    console.log(
      "   ✅ Both localhost and 127.0.0.1 variants included - good for development"
    );
  }

  console.log("\n💡 Debugging Tips:");
  console.log("   1. Check browser Network tab for actual Origin header value");
  console.log("   2. Compare exact string match (case sensitive)");
  console.log("   3. Look for trailing slashes or extra characters");
  console.log(
    "   4. Ensure frontend and backend use same protocol (http/https)"
  );

  console.log("\n🔧 Quick Fixes:");
  console.log("   1. Add exact frontend URL to ALLOWED_ORIGINS");
  console.log("   2. Remove trailing slashes from origins");
  console.log("   3. Restart server after changing .env");
  console.log("   4. Test with curl to isolate browser issues");
}

testOriginValidation();
