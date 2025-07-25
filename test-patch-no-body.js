#!/usr/bin/env node

const http = require("http");

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

async function testPatchNoBody(token) {
  return new Promise((resolve) => {
    const options = {
      hostname: "localhost",
      port: 3000,
      path: "/user/updateActive/1",
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        Origin: "http://localhost:8080",
        // No Content-Type, No Content-Length
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
            success: res.statusCode === 200,
            response: response,
          });
        } catch (error) {
          resolve({
            status: res.statusCode,
            success: false,
            response: { raw: data },
          });
        }
      });
    });

    req.on("error", (error) => {
      resolve({
        status: 0,
        success: false,
        response: { error: error.message },
      });
    });

    // Don't write any data - no body
    req.end();
  });
}

async function testPatchWithEmptyBody(token) {
  return new Promise((resolve) => {
    const options = {
      hostname: "localhost",
      port: 3000,
      path: "/user/updateActive/1",
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        Origin: "http://localhost:8080",
        "Content-Type": "application/json",
        "Content-Length": "2",
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
            success: res.statusCode === 200,
            response: response,
          });
        } catch (error) {
          resolve({
            status: res.statusCode,
            success: false,
            response: { raw: data },
          });
        }
      });
    });

    req.on("error", (error) => {
      resolve({
        status: 0,
        success: false,
        response: { error: error.message },
      });
    });

    req.write("{}"); // Empty JSON object
    req.end();
  });
}

async function main() {
  console.log("🧪 Testing PATCH without body...\n");

  // Get login token
  console.log("1️⃣ Getting login token...");
  const token = await getLoginToken();

  if (!token) {
    console.log("❌ Failed to get login token");
    return;
  }

  console.log("✅ Login successful\n");

  // Test PATCH without body
  console.log(
    "2️⃣ Testing PATCH without body (no Content-Type, no Content-Length)..."
  );
  const nBodyResult = await testPatchNoBody(token);

  if (nBodyResult.success) {
    console.log("   ✅ SUCCESS - PATCH without body works!");
    console.log(`   📊 Status: ${nBodyResult.status}`);
  } else {
    console.log("   ❌ FAILED - PATCH without body blocked");
    console.log(`   📊 Status: ${nBodyResult.status}`);
    console.log(
      `   📝 Message: ${nBodyResult.response.message || "Unknown error"}`
    );
  }

  console.log("");

  // Test PATCH with empty body
  console.log(
    "3️⃣ Testing PATCH with empty body (Content-Type: application/json)..."
  );
  const emptyBodyResult = await testPatchWithEmptyBody(token);

  if (emptyBodyResult.success) {
    console.log("   ✅ SUCCESS - PATCH with empty body works!");
    console.log(`   📊 Status: ${emptyBodyResult.status}`);
  } else {
    console.log("   ❌ FAILED - PATCH with empty body blocked");
    console.log(`   📊 Status: ${emptyBodyResult.status}`);
    console.log(
      `   📝 Message: ${emptyBodyResult.response.message || "Unknown error"}`
    );
  }

  console.log("\n💡 Frontend Recommendations:");

  if (nBodyResult.success) {
    console.log("   ✅ You can send PATCH without Content-Type if no body");
    console.log(
      '   📝 axios.patch("/user/updateActive/1") // No body, no Content-Type'
    );
  } else {
    console.log("   ⚠️ PATCH without Content-Type is blocked");
    console.log("   📝 Always include Content-Type: application/json");
  }

  if (emptyBodyResult.success) {
    console.log("   ✅ You can send PATCH with empty body and Content-Type");
    console.log(
      '   📝 axios.patch("/user/updateActive/1", {}, { headers: { "Content-Type": "application/json" } })'
    );
  }
}

main().catch(console.error);
