// Test script untuk graceful shutdown
const axios = require("axios");
const { spawn } = require("child_process");

async function testGracefulShutdown() {
  console.log("🧪 Testing Graceful Shutdown Implementation");
  console.log("==========================================");

  // Start the application
  console.log("🚀 Starting application...");
  const app = spawn("node", ["index.js"], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, NODE_ENV: "development" },
  });

  let appOutput = "";
  app.stdout.on("data", (data) => {
    appOutput += data.toString();
    process.stdout.write(data);
  });

  app.stderr.on("data", (data) => {
    appOutput += data.toString();
    process.stderr.write(data);
  });

  // Wait for app to start
  await new Promise((resolve) => setTimeout(resolve, 3000));

  try {
    // Test 1: Check shutdown status endpoint
    console.log("\\n📊 Test 1: Checking shutdown status...");
    try {
      const statusResponse = await axios.get(
        "http://localhost:3000/shutdown/status"
      );
      console.log("✅ Shutdown status endpoint working");
      console.log("   Status:", statusResponse.data.data.status);
      console.log("   Handlers:", statusResponse.data.data.handlers.length);
      console.log(
        "   Active connections:",
        statusResponse.data.data.stats.activeConnections
      );
    } catch (error) {
      console.log("❌ Shutdown status endpoint failed:", error.message);
    }

    // Test 2: Check health endpoint
    console.log("\\n🏥 Test 2: Checking health endpoint...");
    try {
      const healthResponse = await axios.get("http://localhost:3000/health");
      console.log("✅ Health endpoint working");
      console.log("   Status:", healthResponse.data.status);

      // Check shutdown headers
      const headers = healthResponse.headers;
      console.log("   Shutdown headers:");
      console.log("     X-Shutdown-Status:", headers["x-shutdown-status"]);
      console.log("     X-Process-ID:", headers["x-process-id"]);
      console.log("     X-Uptime:", headers["x-uptime"]);
      console.log("     X-Memory-Usage:", headers["x-memory-usage"]);
    } catch (error) {
      console.log("❌ Health endpoint failed:", error.message);
    }

    // Test 3: Start multiple requests and trigger shutdown
    console.log(
      "\\n🔄 Test 3: Testing graceful shutdown with active requests..."
    );

    // Start multiple long-running requests
    const longRequests = [];
    for (let i = 0; i < 3; i++) {
      longRequests.push(
        axios
          .get("http://localhost:3000/health", {
            timeout: 10000,
          })
          .catch((err) => ({ error: err.message }))
      );
    }

    // Wait a bit then trigger shutdown
    setTimeout(() => {
      console.log("🛑 Sending SIGTERM to trigger graceful shutdown...");
      app.kill("SIGTERM");
    }, 1000);

    // Wait for requests to complete or fail
    const results = await Promise.allSettled(longRequests);
    console.log("📊 Request results during shutdown:");
    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        if (result.value.error) {
          console.log(`   Request ${index + 1}: Error - ${result.value.error}`);
        } else {
          console.log(
            `   Request ${index + 1}: Success - ${
              result.value.status || result.value.data?.status
            }`
          );
        }
      } else {
        console.log(
          `   Request ${index + 1}: Rejected - ${result.reason.message}`
        );
      }
    });

    // Wait for app to shutdown
    await new Promise((resolve) => {
      app.on("exit", (code, signal) => {
        console.log(
          `\\n🏁 Application exited with code ${code} and signal ${signal}`
        );
        resolve();
      });

      // Force kill after 45 seconds if not shutdown gracefully
      setTimeout(() => {
        console.log("⏰ Force killing application after timeout");
        app.kill("SIGKILL");
        resolve();
      }, 45000);
    });

    // Analyze shutdown logs
    console.log("\\n📋 Shutdown Analysis:");
    const shutdownLogs = appOutput
      .split("\\n")
      .filter(
        (line) =>
          line.includes("shutdown") ||
          line.includes("Received") ||
          line.includes("closed") ||
          line.includes("stopped") ||
          line.includes("completed")
      );

    shutdownLogs.forEach((log) => {
      console.log("   ", log.trim());
    });

    console.log("\\n✅ Graceful shutdown test completed");
  } catch (error) {
    console.error("❌ Test failed:", error.message);
    app.kill("SIGKILL");
  }
}

// Test 4: Test request rejection during shutdown
async function testRequestRejection() {
  console.log("\\n🚫 Test 4: Testing request rejection during shutdown...");

  // This would require a separate test where we manually trigger shutdown
  // and then try to make requests
  console.log("   (This test requires manual execution during shutdown)");
  console.log("   Expected behavior: 503 Service Unavailable responses");
}

// Run tests
if (require.main === module) {
  testGracefulShutdown()
    .then(() => testRequestRejection())
    .then(() => {
      console.log("\\n🎉 All tests completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("💥 Test suite failed:", error);
      process.exit(1);
    });
}

module.exports = { testGracefulShutdown, testRequestRejection };
