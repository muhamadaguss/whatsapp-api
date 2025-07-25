#!/usr/bin/env node

const http = require("http");

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
    "Content-Length": Buffer.byteLength(postData),
  },
};

console.log("🧪 Testing Login API...");
console.log("📝 Request:", JSON.stringify(JSON.parse(postData), null, 2));

const req = http.request(options, (res) => {
  console.log(`📊 Status: ${res.statusCode}`);
  console.log(`📋 Headers:`, res.headers);

  let data = "";
  res.on("data", (chunk) => {
    data += chunk;
  });

  res.on("end", () => {
    try {
      const response = JSON.parse(data);
      console.log("✅ Response:");
      console.log(JSON.stringify(response, null, 2));

      if (response.token) {
        console.log("\n🎉 Login successful! JWT token generated.");
        console.log("Token length:", response.token.length);
      }
    } catch (error) {
      console.log("📄 Raw response:", data);
    }
  });
});

req.on("error", (error) => {
  console.error("❌ Request error:", error.message);
});

req.write(postData);
req.end();
