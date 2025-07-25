#!/usr/bin/env node

const http = require("http");

// Test CORS preflight request
async function testCORSPreflight(path, method = "PATCH") {
  return new Promise((resolve) => {
    const options = {
      hostname: "localhost",
      port: 3000,
      path: path,
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:8080",
        "Access-Control-Request-Method": method,
        "Access-Control-Request-Headers": "Content-Type, Authorization",
      },
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: data,
        });
      });
    });

    req.on("error", (error) => {
      resolve({
        status: 0,
        error: error.message,
      });
    });

    req.end();
  });
}

// Test actual user management request
async function testUserManagement(token) {
  return new Promise((resolve) => {
    const postData = JSON.stringify({});

    const options = {
      hostname: "localhost",
      port: 3000,
      path: "/user/updateActive/5",
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        Origin: "http://localhost:8080",
        "Content-Length": Buffer.byteLength(postData),
      },
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        try {
          const response = JSON.parse(data);
          resolve({
            status: res.statusCode,
            headers: res.headers,
            response: response,
          });
        } catch (error) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            response: { raw: data },
          });
        }
      });
    });

    req.on("error", (error) => {
      resolve({
        status: 0,
        error: error.message,
      });
    });

    req.write(postData);
    req.end();
  });
}

// Get login token first
async function getLoginToken() {
  return new Promise((resolve) => {
    const postData = JSON.stringify({
      username: "admin",
      password: "password",
    });

    const options = {
      hostname: "localhost",
      port: 3000,
      path: "/auth/login",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:8080",
        "Content-Length": Buffer.byteLength(postData),
      },
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        try {
          const response = JSON.parse(data);
          resolve(response.token);
        } catch (error) {
          resolve(null);
        }
      });
    });

    req.on("error", (error) => {
      resolve(null);
    });

    req.write(postData);
    req.end();
  });
}

async function main() {
  console.log("🧪 Testing CORS for User Management...\n");

  // Test 1: CORS Preflight
  console.log("1️⃣ Testing CORS Preflight (OPTIONS)...");
  const preflightResult = await testCORSPreflight(
    "/user/updateActive/1",
    "PATCH"
  );

  if (preflightResult.status === 204 || preflightResult.status === 200) {
    console.log("   ✅ CORS Preflight successful");
    console.log("   📋 CORS Headers:");
    console.log(
      `      - Access-Control-Allow-Origin: ${preflightResult.headers["access-control-allow-origin"]}`
    );
    console.log(
      `      - Access-Control-Allow-Methods: ${preflightResult.headers["access-control-allow-methods"]}`
    );
    console.log(
      `      - Access-Control-Allow-Headers: ${preflightResult.headers["access-control-allow-headers"]}`
    );
    console.log(
      `      - Access-Control-Allow-Credentials: ${preflightResult.headers["access-control-allow-credentials"]}`
    );
  } else {
    console.log(
      `   ❌ CORS Preflight failed - Status: ${preflightResult.status}`
    );
    if (preflightResult.error) {
      console.log(`   📝 Error: ${preflightResult.error}`);
    }
  }

  console.log("");

  // Test 2: Get Login Token
  console.log("2️⃣ Getting login token...");
  const token = await getLoginToken();

  if (token) {
    console.log("   ✅ Login successful");
    console.log(`   🎫 Token: ${token.substring(0, 30)}...`);
  } else {
    console.log("   ❌ Login failed");
    return;
  }

  console.log("");

  // Test 3: User Management Request
  console.log("3️⃣ Testing User Management (PATCH /user/updateActive/1)...");
  const userResult = await testUserManagement(token);

  if (userResult.status === 200) {
    console.log("   ✅ User management request successful");
    console.log("   📊 Response:");
    console.log(JSON.stringify(userResult.response, null, 4));
  } else {
    console.log(
      `   ❌ User management request failed - Status: ${userResult.status}`
    );
    console.log("   📝 Response:");
    console.log(JSON.stringify(userResult.response, null, 4));

    // Check for CORS-related headers
    if (userResult.headers) {
      console.log("   📋 Response Headers:");
      Object.keys(userResult.headers).forEach((key) => {
        if (
          key.toLowerCase().includes("cors") ||
          key.toLowerCase().includes("access-control")
        ) {
          console.log(`      - ${key}: ${userResult.headers[key]}`);
        }
      });
    }
  }

  console.log("\n🎉 CORS testing completed!");
}

main().catch(console.error);
