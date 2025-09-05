require("dotenv").config();

// Validate environment variables before starting the application
const {
  validateWhatsAppEnv,
  validateProductionSecurity,
} = require("./utils/validateEnv");
const envConfig = validateWhatsAppEnv();
validateProductionSecurity(envConfig);

const cors = require("cors");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const bodyParser = require("body-parser");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const slowDown = require("express-slow-down");
const whatsappRoutes = require("./routes/whatsappRoutes");
const authRoutes = require("./routes/authRoutes");
const downloadRoutes = require("./routes/downloadRoutes");
const campaignRoutes = require("./routes/campaignRoutes");
const userRoutes = require("./routes/userRoutes");
const menuRoutes = require("./routes/menuRoutes");
const templateRoutes = require("./routes/templateRoutes");
const chatsRoutes = require("./routes/chatRoutes");
const contactRoutes = require("./routes/contactRoutes");
const cleanupRoutes = require("./routes/cleanupRoutes");
const blastControlRoutes = require("./routes/blastControlRoutes");
const sequelize = require("./models/db");
const { loadExistingSessions } = require("./auth/session");
const logger = require("./utils/logger"); // Mengimpor logger
const { initSocket } = require("./auth/socket");
const { errorHandler, notFound } = require("./middleware/errorHandler");
const {
  DatabaseHealthCheck,
  testDatabaseConnection,
  validateDatabaseConfig,
} = require("./utils/dbHealthCheck");
const SecurityUtils = require("./utils/security");
const FileCleanupManager = require("./utils/fileCleanup");
const {
  requestLogger,
  securityHeaders,
  sanitizeInput,
  validateOrigin,
  validateContentType,
  validateRequestSize,
} = require("./middleware/securityMiddleware");

const app = express();
const port = envConfig.PORT;

// Initialize file cleanup manager
const fileCleanup = new FileCleanupManager({
  tempFileMaxAge: 24 * 60 * 60 * 1000, // 24 hours
  logFileMaxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  sessionFileMaxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  cleanupInterval: 60 * 60 * 1000, // 1 hour
  directories: {
    uploads: "./uploads",
    logs: "./logs",
    sessions: "./sessions",
    temp: "./temp",
  },
  maxFilesToDelete: 100,
  dryRun: process.env.CLEANUP_DRY_RUN === "true", // Control via environment variable
});

// Enhanced CORS configuration with security validation
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim())
  : [
      "http://localhost:8080",
      "http://127.0.0.1:8080",
      "https://whatsapp-web.jobmarket.my.id",
      "http://localhost:8081",
      "http://127.0.0.1:8081",
    ];

// Generate secure CORS configuration
const corsConfig = SecurityUtils.generateCORSConfig(allowedOrigins);
app.use(cors(corsConfig));

// Security middleware
const helmetConfig = SecurityUtils.generateSecurityHeaders();
app.use(helmet(helmetConfig));

// Custom security middleware
app.use(requestLogger);
app.use(securityHeaders);
app.use(validateOrigin(allowedOrigins));
app.use(validateContentType);
app.use(validateRequestSize("10mb"));
app.use(sanitizeInput);

// Removed shutdown handling middleware

// Rate limiting
app.set("trust proxy", 1);
const rateLimitConfig = SecurityUtils.generateRateLimitConfig();
const limiter = rateLimit(rateLimitConfig);
app.use("/api/", limiter); // Apply to API routes only

// Speed limiting (slow down repeated requests) - Compatible with express-slow-down v2
const speedLimitConfig = SecurityUtils.generateSpeedLimitConfig();
const speedLimiter = slowDown(speedLimitConfig);
app.use(speedLimiter);

// Body parser with size limits
app.use(
  bodyParser.json({
    limit: "10mb",
    verify: (req, res, buf) => {
      // Store raw body for webhook verification if needed
      req.rawBody = buf;
    },
  })
);
app.use(
  bodyParser.urlencoded({
    extended: true,
    limit: "10mb",
  })
);

// Enhanced health check endpoint
app.get("/health", async (req, res) => {
  try {
    const dbStatus = await dbHealthCheck.performCheck();
    const healthStatus = {
      status: dbStatus.healthy ? "OK" : "DEGRADED",
      timestamp: new Date().toISOString(),
      environment: envConfig.NODE_ENV,
      version: require("./package.json").version || "1.0.0",
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      database: dbStatus,
      pid: process.pid,
    };

    const statusCode = dbStatus.healthy ? 200 : 503;
    res.status(statusCode).json(healthStatus);
  } catch (error) {
    res.status(503).json({
      status: "ERROR",
      timestamp: new Date().toISOString(),
      error: error.message,
    });
  }
});

// Readiness probe endpoint
app.get("/ready", async (req, res) => {
  try {
    const dbStatus = await dbHealthCheck.performCheck();
    if (dbStatus.healthy) {
      res
        .status(200)
        .json({ status: "READY", timestamp: new Date().toISOString() });
    } else {
      res
        .status(503)
        .json({ status: "NOT_READY", reason: "Database not available" });
    }
  } catch (error) {
    res.status(503).json({ status: "NOT_READY", error: error.message });
  }
});

// Removed shutdown status endpoint

// File cleanup management endpoints
app.get("/cleanup/stats", async (req, res) => {
  try {
    const stats = await fileCleanup.getCleanupStats();
    res.status(200).json({
      status: "success",
      data: stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
});

app.post("/cleanup/manual", async (req, res) => {
  try {
    const options = {
      dryRun: req.body.dryRun !== false, // Default to dry run
      maxAge: req.body.maxAge ? parseInt(req.body.maxAge) : undefined,
    };

    const results = await fileCleanup.manualCleanup(options);
    res.status(200).json({
      status: "success",
      data: results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
});

// Serve static files for uploaded images and received media
const path = require("path");
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/media", express.static(path.join(__dirname, "media")));

app.use("/whatsapp", whatsappRoutes);
app.use("/auth", authRoutes);
app.use("/download", downloadRoutes);
app.use("/campaign", campaignRoutes);
app.use("/user", userRoutes);
app.use("/menus", menuRoutes);
app.use("/templates", templateRoutes);
app.use("/chats", chatsRoutes);
app.use("/contacts", contactRoutes);
app.use("/cleanup", cleanupRoutes);
app.use("/classifier", require("./routes/classifierRoutes"));
app.use("/spin-text", require("./routes/spinTextRoutes"));
app.use("/blast-control", blastControlRoutes);

// Error handling middleware (harus di akhir setelah semua routes)
app.use(notFound); // 404 handler
app.use(errorHandler); // Global error handler

// Inisialisasi dan jalankan socket.io
const server = http.createServer(app); // Gunakan app di sini
const io = initSocket(server);

io.on("connection", (socket) => {
  logger.info(`✅ User connected via socket.io. ID: ${socket.id}, User: ${socket.userId}`);
  
  // Join user to their specific room
  if (socket.userId) {
    socket.join(`user_${socket.userId}`);
    logger.info(`👤 User ${socket.userId} joined room: user_${socket.userId}`);
  }
  
  socket.on("disconnect", () => {
    logger.info(`❌ User disconnected: ${socket.id} (User: ${socket.userId})`);
  });
});

// Initialize database health check
const dbHealthCheck = new DatabaseHealthCheck(sequelize);

// Database initialization with proper error handling
async function initializeDatabase() {
  try {
    // Validate database configuration
    validateDatabaseConfig();

    // Test database connection with retry logic
    await testDatabaseConnection(sequelize);

    // Import all models to ensure they are registered with Sequelize
    logger.info("📋 Loading models...");

    // Load existing models
    require("./models/userModel");
    require("./models/sessionModel");
    require("./models/blastModel");
    require("./models/chatModel");
    require("./models/templateModel");
    require("./models/menuModel");
    require("./models/messageStatusModel");
    require("./models/blacklistedTokenModel");

    // Load new blast session models
    require("./models/blastSessionModel");
    require("./models/blastMessageModel");

    // Skip associations setup for now to avoid conflicts
    // Associations can be added later when needed
    logger.info("⚠️ Skipping associations setup to avoid conflicts");

    logger.info("✅ All models loaded successfully");

    // Sync database models
    await sequelize.sync({ alter: true });
    logger.info("📊 Database synced successfully");

    // Start periodic health checks
    dbHealthCheck.startPeriodicCheck();

    return true;
  } catch (error) {
    logger.error("💥 Database initialization failed:", error.message);
    throw error;
  }
}

// Application startup sequence
async function startApplication() {
  try {
    // Initialize database
    await initializeDatabase();

    // Load existing WhatsApp sessions
    await loadExistingSessions();
    logger.info("📱 All existing sessions loaded");

    // Start file cleanup manager
    fileCleanup.startAutoCleanup();
    logger.info("🧹 File cleanup manager started");

    // Start the server
    server.listen(port, () => {
      logger.info(`🚀 Server running at http://localhost:${port}`);
      logger.info(`🌍 Environment: ${envConfig.NODE_ENV}`);
      logger.info(`📊 Process ID: ${process.pid}`);
      logger.info("✅ Application startup completed");
    });
  } catch (error) {
    logger.error("💥 Application startup failed:", error.message);
    logger.error("💥 Error stack:", error.stack);
    console.error("Full error object:", error);
    process.exit(1);
  }
}

// Removed shutdown handlers

// Basic error handling (non-graceful)
process.on("uncaughtException", (error) => {
  logger.error("💥 Uncaught Exception:", error);
  // Don't exit, just log the error
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("💥 Unhandled Rejection Details:", {
    promise: promise,
    reason: reason,
    stack: reason?.stack || "No stack trace",
    type: typeof reason,
    message: reason?.message || "No message",
    code: reason?.code || "No code",
  });
  // Don't exit, just log the error
});

// Start the application
startApplication();
