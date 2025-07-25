#!/usr/bin/env node

const http = require("http");

// Test different origins
const testOrigins = [
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://localhost:8081",
  "http://127.0.0.1:8081",
  "https://whatsapp-web.jobmarket.my.id",
  "http://localhost:3000", // Same originuld fail
  null, // No origin (mobile apps)
];

async function testOrigin(origin, path = "/user/updateActive/1") {
  return new Promise((resolve) => {
    const headers = {
      "Access-Control-Request-Method": "PATCH",
      "Access-Control-Request-Headers": "Content-Type, Authorization",
    };

    if (origin) {
      headers["Origin"] = origin;
    }

    const options = {
      hostname: "localhost",
      port: 3000,
      path: path,
      method: "OPTIONS",
      headers: headers,
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        resolve({
          origin: origin || "No Origin",
          status: res.statusCode,
          allowOrigin: res.headers["access-control-allow-origin"],
          allowMethods: res.headers["access-control-allow-methods"],
          allowHeaders: res.headers["access-control-allow-headers"],
          allowCredentials: res.headers["access-control-allow-credentials"],
          success: res.statusCode === 204 || res.statusCode === 200,
        });
      });
    });

    req.on("error", (error) => {
      resolve({
        origin: origin || "No Origin",
        status: 0,
        error: error.message,
        success: false,
      });
    });

    req.end();
  });
}

async function main() {
  console.log("🌐 Testing CORS with different origins...\n");

  console.log(
    "┌─────────────────────────────────────┬────────┬─────────────────────────────────────┬─────────┐"
  );
  console.log(
    "│ Origin                              │ Status │ Allow-Origin                        │ Success │"
  );
  console.log(
    "├─────────────────────────────────────┼────────┼─────────────────────────────────────┼─────────┤"
  );

  for (const origin of testOrigins) {
    const result = await testOrigin(origin);

    const originDisplay = (result.origin || "No Origin").padEnd(35);
    const statusDisplay = result.status.toString().padEnd(6);
    const allowOriginDisplay = (result.allowOrigin || "undefined").padEnd(35);
    const successDisplay = result.success ? "✅ Yes" : "❌ No";

    console.log(
      `│ ${originDisplay} │ ${statusDisplay} │ ${allowOriginDisplay} │ ${successDisplay}   │`
    );

    if (result.error) {
      console.log(`│ Error: ${result.error.padEnd(88)} │`);
    }
  }

  console.log(
    "└─────────────────────────────────────┴────────┴─────────────────────────────────────┴─────────┘"
  );

  console.log("\n📋 CORS Configuration Analysis:");

  // Test a successful origin to get full CORS info
  const successResult = await testOrigin("http://localhost:8080");
  if (successResult.success) {
    console.log("✅ CORS is properly configured");
    console.log(`   - Allowed Methods: ${successResult.allowMethods}`);
    console.log(`   - Allowed Headers: ${successResult.allowHeaders}`);
    console.log(`   - Credentials: ${successResult.allowCredentials}`);
  } else {
    console.log("❌ CORS configuration issue detected");
  }

  console.log("\n💡 Common CORS Issues:");
  console.log("1. Frontend using wrong origin (check browser dev tools)");
  console.log("2. Missing PATCH method in allowed methods");
  console.log("3. Missing Authorization header in allowed headers");
  console.log("4. Credentials not properly configured");
  console.log("5. Browser caching old CORS preflight responses");

  console.log("\n🔧 Debugging Steps:");
  console.log("1. Check browser Network tab for actual origin being sent");
  console.log("2. Clear browser cache and hard refresh");
  console.log("3. Check if frontend is sending credentials: true");
  console.log("4. Verify frontend is using correct API endpoint URL");
}

main().catch(console.error);
