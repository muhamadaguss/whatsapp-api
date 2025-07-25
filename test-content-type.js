#!/usr/bin/env node

const http = require("http");

// Test different content types
const testContentTypes = [
  "application/json",
  "application/json; charset=utf-8",
  "application/x-www-form-urlencoded",
  "multipart/form-data",
  "text/plain",
  "application/octet-stream",
  null, // No content type
  undefined, // No content type
];

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

async function testContentType(contentType, token) {
  return new Promise((resolve) => {
    const postData = JSON.stringify({});

    const headers = {
      Authorization: `Bearer ${token}`,
      Origin: "http://localhost:8080",
      "Content-Length": Buffer.byteLength(postData),
    };

    if (contentType) {
      headers["Content-Type"] = contentType;
    }

    const options = {
      hostname: "localhost",
      port: 3000,
      path: "/user/updateActive/1",
      method: "PATCH",
      headers: headers,
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
            contentType: contentType || "No Content-Type",
            status: res.statusCode,
            success: res.statusCode === 200,
            response: response,
          });
        } catch (error) {
          resolve({
            contentType: contentType || "No Content-Type",
            status: res.statusCode,
            success: false,
            response: { raw: data },
          });
        }
      });
    });

    req.on("error", (error) => {
      resolve({
        contentType: contentType || "No Content-Type",
        status: 0,
        success: false,
        response: { error: error.message },
      });
    });

    req.write(postData);
    req.end();
  });
}

async function main() {
  console.log("🧪 Testing Content-Type Validation...\n");

  // Get login token
  console.log("1️⃣ Getting login token...");
  const token = await getLoginToken();

  if (!token) {
    console.log("❌ Failed to get login token");
    return;
  }

  console.log("✅ Login successful\n");

  // Test different content types
  console.log("2️⃣ Testing different Content-Type headers...\n");

  console.log(
    "┌─────────────────────────────────────┬────────┬─────────┬─────────────────────┐"
  );
  console.log(
    "│ Content-Type                        │ Status │ Success │ Message             │"
  );
  console.log(
    "├─────────────────────────────────────┼────────┼─────────┼─────────────────────┤"
  );

  for (const contentType of testContentTypes) {
    const result = await testContentType(contentType, token);

    const displayContentType = (result.contentType || "No Content-Type").padEnd(
      35
    );
    const statusDisplay = result.status.toString().padEnd(6);
    const successDisplay = result.success ? "✅ Yes" : "❌ No";
    const messageDisplay =
      result.response.message || (result.success ? "User updated" : "Failed");
    const paddedMessage = messageDisplay.substring(0, 19).padEnd(19);

    console.log(
      `│ ${displayContentType} │ ${statusDisplay} │ ${successDisplay}   │ ${paddedMessage} │`
    );
  }

  console.log(
    "└─────────────────────────────────────┴────────┴─────────┴─────────────────────┘"
  );

  console.log("\n📋 Content-Type Validation Rules:");
  console.log("   ✅ application/json");
  console.log("   ✅ application/json; charset=utf-8");
  console.log("   ✅ application/x-www-form-urlencoded");
  console.log("   ✅ multipart/form-data");
  console.log("   ❌ text/plain");
  console.log("   ❌ application/octet-stream");
  console.log("   ❌ No Content-Type header");

  console.log("\n💡 Frontend Solutions:");
  console.log("   1. Always set Content-Type: application/json");
  console.log(
    "   2. Include charset if needed: application/json; charset=utf-8"
  );
  console.log("   3. Ensure axios/fetch sends correct headers");

  console.log("\n🔧 Frontend Code Examples:");
  console.log("   // Axios");
  console.log('   axios.patch("/user/updateActive/1", {}, {');
  console.log("     headers: {");
  console.log('       "Content-Type": "application/json",');
  console.log('       "Authorization": `Bearer ${token}`');
  console.log("     }");
  console.log("   });");

  console.log("\n   // Fetch");
  console.log('   fetch("/user/updateActive/1", {');
  console.log('     method: "PATCH",');
  console.log("     headers: {");
  console.log('       "Content-Type": "application/json",');
  console.log('       "Authorization": `Bearer ${token}`');
  console.log("     },");
  console.log("     body: JSON.stringify({})");
  console.log("   });");
}

main().catch(console.error);
