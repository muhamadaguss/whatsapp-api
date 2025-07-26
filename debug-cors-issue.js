#!/usr/bin/env node

require("dotenv").config();
const SecurityUtils = require("./utils/security");

function debugCORSIssue() {
  console.log("🔍 Debugging CORS Issue for User Management...\n");

  // 1. Check environment variables
  console.log("1️⃣ Environment Configuration:");
  console.log(`   NODE_ENV: ${process.env.NODE_ENV || "undefined"}`);
  console.log(
    `   ALLOWED_ORIGINS: ${process.env.ALLOWED_ORIGINS || "undefined"}`
  );

  // 2. Show current allowed origins
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim())
    : [
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "https://whatsapp-web.jobmarket.my.id",
        "http://localhost:8081",
        "http://127.0.0.1:8081",
      ];

  console.log("\n2️⃣ Current Allowed Origins:");
  allowedOrigins.forEach((origin, index) => {
    console.log(`   ${index + 1}. ${origin}`);
  });

  // 3. Generate and show CORS config
  console.log("\n3️⃣ Generated CORS Configuration:");
  try {
    const corsConfig = SecurityUtils.generateCORSConfig(allowedOrigins);
    console.log("   ✅ CORS config generated successfully");
    console.log(`   📋 Methods: ${corsConfig.methods.join(", ")}`);
    console.log(`   📋 Headers: ${corsConfig.allowedHeaders.join(", ")}`);
    console.log(`   📋 Credentials: ${corsConfig.credentials}`);
    console.log(`   📋 Max Age: ${corsConfig.maxAge}s`);
  } catch (error) {
    console.log(`   ❌ CORS config error: ${error.message}`);
  }

  // 4. Common solutions
  console.log("\n4️⃣ Common CORS Solutions:");
  console.log("   🔧 Frontend Issues:");
  console.log("      - Check if frontend URL matches allowed origins");
  console.log("      - Ensure axios/fetch includes credentials: true");
  console.log("      - Clear browser cache (Ctrl+Shift+R)");
  console.log("      - Check browser Network tab for actual origin");

  console.log("\n   🔧 Backend Issues:");
  console.log("      - Add frontend URL to ALLOWED_ORIGINS in .env");
  console.log("      - Restart server after changing .env");
  console.log("      - Check if middleware order is correct");

  // 5. Frontend code examples
  console.log("\n5️⃣ Frontend Code Examples:");
  console.log("   📝 Axios Configuration:");
  console.log(`   axios.defaults.withCredentials = true;
   axios.patch('/user/updateActive/1', {}, {
     headers: {
       'Authorization': 'Bearer ' + token,
       'Content-Type': 'application/json'
     }
   });`);

  console.log("\n   📝 Fetch Configuration:");
  console.log(`   fetch('/user/updateActive/1', {
     method: 'PATCH',
     credentials: 'include',
     headers: {
       'Authorization': 'Bearer ' + token,
       'Content-Type': 'application/json'
     }
   });`);

  // 6. Environment file example
  console.log("\n6️⃣ Environment File Example (.env):");
  console.log(`   NODE_ENV=development
   ALLOWED_ORIGINS=http://localhost:8080,http://127.0.0.1:8080,https://yourdomain.com`);

  // 7. Quick fixes
  console.log("\n7️⃣ Quick Fixes to Try:");
  console.log("   1. Add your frontend URL to ALLOWED_ORIGINS");
  console.log("   2. Restart the server");
  console.log("   3. Clear browser cache");
  console.log("   4. Check browser console for exact error message");
  console.log("   5. Test with curl or Postman first");

  console.log("\n🎯 Next Steps:");
  console.log("   1. Run: node test-cors-user-management.js");
  console.log("   2. Check browser Network tab");
  console.log("   3. Compare actual origin with allowed origins");
  console.log("   4. Update .env if needed");
}

debugCORSIssue();
