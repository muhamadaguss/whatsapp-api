#!/usr/bin/env node

const http = require("http");

const testCredentials = [
  { username: "admin", password: "password" },
  { username: "admin2", password: "admin123" },
  { username: "test", password: "test123" },
  { username: "demo", password: "demo" },
  { username: "invalid", password: "invalid" }, // Should fail
];

async function testLogin(credentials) {
  return new Promise((resolve) => {
    const postData = JSON.stringify(credentials);

    const options = {
      hostname: "localhost",
      port: 3000,
      path: "/auth/login",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
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
            success: res.statusCode === 200,
            response: response,
            credentials: credentials,
          });
        } catch (error) {
          resolve({
            status: res.statusCode,
            success: false,
            response: { error: "Invalid JSON response" },
            credentials: credentials,
          });
        }
      });
    });

    req.on("error", (error) => {
      resolve({
        status: 0,
        success: false,
        response: { error: error.message },
        credentials: credentials,
      });
    });

    req.write(postData);
    req.end();
  });
}

async function testAllCredentials() {
  console.log("🧪 Testing all credentials...\n");

  for (const credentials of testCredentials) {
    console.log(
      `🔐 Testing: ${credentials.username} / ${credentials.password}`
    );

    const result = await testLogin(credentials);

    if (result.success) {
      console.log(`   ✅ SUCCESS - Status: ${result.status}`);
      console.log(
        `   👤 User: ${result.response.user.username} (${result.response.user.role})`
      );
      console.log(`   🎫 Token: ${result.response.token.substring(0, 30)}...`);
    } else {
      console.log(`   ❌ FAILED - Status: ${result.status}`);
      console.log(
        `   📝 Message: ${result.response.message || result.response.error}`
      );
    }
    console.log("");
  }

  console.log("🎉 All credential tests completed!");
}

testAllCredentials().catch(console.error);
