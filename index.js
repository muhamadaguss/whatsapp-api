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
const cleanupRoutes = require("./routes/cleanupRoutes");
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
const GracefulShutdownManager = require("./utils/gracefulShutdown");
const {
  requestLogger,
  securityHeaders,
  sanitizeInput,
  validateOrigin,
  validateContentType,
  validateRequestSize,
} = require("./middleware/securityMiddleware");
const {
  shutdownMiddleware,
  requestTrackingMiddleware,
  shutdownHeadersMiddleware,
} = require("./middleware/shutdownMiddleware");

const app = express();
const port = envConfig.PORT;

// Initialize graceful shutdown manager
const shutdownManager = new GracefulShutdownManager();
shutdownManager.setShutdownTimeout(30000); // 30 seconds

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

// Shutdown handling middleware
app.use(shutdownHeadersMiddleware(shutdownManager));
app.use(requestTrackingMiddleware(shutdownManager));
app.use(shutdownMiddleware(shutdownManager));

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

// Shutdown status endpoint
app.get("/shutdown/status", (req, res) => {
  try {
    const healthCheck = shutdownManager.healthCheck();
    res.status(200).json({
      status: "success",
      data: healthCheck,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
});

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

app.use("/whatsapp", whatsappRoutes);
app.use("/auth", authRoutes);
app.use("/download", downloadRoutes);
app.use("/campaign", campaignRoutes);
app.use("/user", userRoutes);
app.use("/menus", menuRoutes);
app.use("/templates", templateRoutes);
app.use("/chats", chatsRoutes);
app.use("/cleanup", cleanupRoutes);

// Error handling middleware (harus di akhir setelah semua routes)
app.use(notFound); // 404 handler
app.use(errorHandler); // Global error handler

// Inisialisasi dan jalankan socket.io
const server = http.createServer(app); // Gunakan app di sini
const io = initSocket(server);

io.on("connection", (socket) => {
  logger.info(`✅ A user connected via socket.io. ID: ${socket.id}`);
  socket.on("disconnect", () => {
    logger.info(`❌ User disconnected: ${socket.id}`);
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

    // Register shutdown handlers
    registerShutdownHandlers();

    // Start the server
    server.listen(port, () => {
      logger.info(`🚀 Server running at http://localhost:${port}`);
      logger.info(`🌍 Environment: ${envConfig.NODE_ENV}`);
      logger.info(`📊 Process ID: ${process.pid}`);
      logger.info("✅ Application startup completed");

      // Track server connections for graceful shutdown
      server.on("connection", (connection) => {
        shutdownManager.trackConnection(connection);
      });
    });
  } catch (error) {
    logger.error("💥 Application startup failed:", error.message);
    logger.error("💥 Error stack:", error.stack);
    console.error("Full error object:", error);
    process.exit(1);
  }
}

// Register shutdown handlers
function registerShutdownHandlers() {
  // Priority 10: Stop accepting new connections
  shutdownManager.registerHandler(
    "http-server",
    async () => {
      return new Promise((resolve, reject) => {
        server.close((err) => {
          if (err) {
            logger.error("❌ Error during server shutdown:", err);
            reject(err);
          } else {
            logger.info("🔌 HTTP server closed");
            resolve();
          }
        });
      });
    },
    10
  );

  // Priority 20: Stop Socket.IO
  shutdownManager.registerHandler(
    "socket-io",
    async () => {
      return new Promise((resolve) => {
        if (io) {
          io.close(() => {
            logger.info("🔌 Socket.IO server closed");
            resolve();
          });
        } else {
          resolve();
        }
      });
    },
    20
  );

  // Priority 30: Stop file cleanup manager
  shutdownManager.registerHandler(
    "file-cleanup",
    async () => {
      fileCleanup.stopAutoCleanup();
      logger.info("🧹 File cleanup manager stopped");
    },
    30
  );

  // Priority 40: Stop database health checks
  shutdownManager.registerHandler(
    "db-health-check",
    async () => {
      dbHealthCheck.stopPeriodicCheck();
      logger.info("🏥 Database health check stopped");
    },
    40
  );

  // Priority 50: Close database connection
  shutdownManager.registerHandler(
    "database",
    async () => {
      await sequelize.close();
      logger.info("🗄️ Database connection closed");
    },
    50
  );

  // Priority 60: Final cleanup
  shutdownManager.registerHandler(
    "final-cleanup",
    async () => {
      // Any final cleanup tasks
      logger.info("🧹 Final cleanup completed");
    },
    60
  );

  // Setup signal handlers
  shutdownManager.setupSignalHandlers();
}

// Start the application
startApplication();
