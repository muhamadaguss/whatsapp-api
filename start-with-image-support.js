// Start server with image support and graceful database handling
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

console.log("🚀 Starting WhatsApp server with image support...");

// Test database connection first
async function testDatabaseConnection() {
  try {
    const { Client } = require("pg");
    const client = new Client({
      host: process.env.DB_HOST || "localhost",
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: String(process.env.DB_PASS),
    });

    await client.connect();
    console.log("✅ Database connection successful");

    // Check if required columns exist
    const result = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'chat_messages' 
      AND column_name IN ('messageType', 'mediaUrl');
    `);

    const hasMessageType = result.rows.some(
      (row) => row.column_name === "messageType"
    );
    const hasMediaUrl = result.rows.some(
      (row) => row.column_name === "mediaUrl"
    );

    if (!hasMessageType || !hasMediaUrl) {
      console.log("⚠️ Required columns missing. Run: node simple-migration.js");
      return false;
    }

    console.log("✅ Database schema is ready for image support");
    await client.end();
    return true;
  } catch (error) {
    console.error("❌ Database connection failed:", error.message);
    console.log(
      "⚠️ Server will start but image features may not work properly"
    );
    return false;
  }
}

// Start the server
async function startServer() {
  const dbReady = await testDatabaseConnection();

  if (!dbReady) {
    console.log("\n🔧 To fix database issues:");
    console.log("1. Ensure PostgreSQL is running");
    console.log("2. Run: node simple-migration.js");
    console.log("3. Restart this server");
    console.log("\n⏳ Starting server anyway...\n");
  }

  // Create basic express app for testing
  const app = express();

  // Enable CORS
  app.use(
    cors({
      origin: process.env.ALLOWED_ORIGINS?.split(",") || [
        "http://localhost:8080",
      ],
      credentials: true,
    })
  );

  // Parse JSON bodies
  app.use(express.json());

  // Serve static files for images
  app.use("/uploads", express.static(path.join(__dirname, "uploads")));

  // Basic health check
  app.get("/health", (req, res) => {
    res.json({
      status: "ok",
      imageSupport: true,
      database: dbReady ? "connected" : "disconnected",
      timestamp: new Date().toISOString(),
    });
  });

  // Test image upload endpoint
  app.get("/test-image", (req, res) => {
    res.json({
      message: "Image support is configured",
      uploadsPath: "/uploads",
      staticServing: "enabled",
    });
  });

  const PORT = process.env.PORT || 3000;

  app.listen(PORT, () => {
    console.log(`🌟 Server running on port ${PORT}`);
    console.log(`📷 Image uploads: http://localhost:${PORT}/uploads/`);
    console.log(`🔍 Health check: http://localhost:${PORT}/health`);

    if (dbReady) {
      console.log("✅ Ready to handle image messages!");
    } else {
      console.log(
        "⚠️ Database not ready - fix database connection for full functionality"
      );
    }
  });
}

startServer().catch(console.error);
