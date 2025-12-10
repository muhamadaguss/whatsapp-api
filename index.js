require("dotenv").config();
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
const logger = require("./utils/logger");
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
const fileCleanup = new FileCleanupManager({
  tempFileMaxAge: 24 * 60 * 60 * 1000,
  logFileMaxAge: 7 * 24 * 60 * 60 * 1000,
  sessionFileMaxAge: 30 * 24 * 60 * 60 * 1000,
  cleanupInterval: 60 * 60 * 1000,
  directories: {
    uploads: "./uploads",
    logs: "./logs",
    sessions: "./sessions",
    temp: "./temp",
  },
  maxFilesToDelete: 100,
  dryRun: process.env.CLEANUP_DRY_RUN === "true",
});
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim())
  : [
      "http://localhost:8080",
      "http://127.0.0.1:8080",
      "https://whatsapp-web.jobmarket.my.id",
      "http://localhost:8081",
      "http://127.0.0.1:8081",
    ];
const corsConfig = SecurityUtils.generateCORSConfig(allowedOrigins);
app.use(cors(corsConfig));
const helmetConfig = SecurityUtils.generateSecurityHeaders();
app.use(helmet(helmetConfig));
app.use(requestLogger);
app.use(securityHeaders);
app.use(validateOrigin(allowedOrigins));
app.use(validateContentType);
app.use(validateRequestSize("10mb"));
app.use(sanitizeInput);
app.set("trust proxy", 1);
const rateLimitConfig = SecurityUtils.generateRateLimitConfig();
const limiter = rateLimit(rateLimitConfig);
app.use("/api/", limiter);
const speedLimitConfig = SecurityUtils.generateSpeedLimitConfig();
const speedLimiter = slowDown(speedLimitConfig);
app.use(speedLimiter);
app.use(
  bodyParser.json({
    limit: "10mb",
    verify: (req, res, buf) => {
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
      dryRun: req.body.dryRun !== false,
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
app.use("/api/blast", require("./routes/riskAssessment"));
app.use("/api/whatsapp", require("./routes/accountHealth"));
app.use("/auto-reply", require("./routes/autoReplyRoutes"));
app.use(notFound);
app.use(errorHandler);
const server = http.createServer(app);
const io = initSocket(server);
io.on("connection", (socket) => {
  logger.info(
    `✅ User connected via socket.io. ID: ${socket.id}, User: ${socket.userId}`
  );
  if (socket.userId) {
    socket.join(`user_${socket.userId}`);
    logger.info(`👤 User ${socket.userId} joined room: user_${socket.userId}`);
    const rooms = Array.from(socket.rooms);
    logger.info(`🏠 Socket ${socket.id} is in rooms:`, rooms);
  }
  socket.on("disconnect", () => {
    logger.info(`❌ User disconnected: ${socket.id} (User: ${socket.userId})`);
  });
});
const dbHealthCheck = new DatabaseHealthCheck(sequelize);
async function initializeDatabase() {
  try {
    validateDatabaseConfig();
    await testDatabaseConnection(sequelize);
    logger.info("📋 Loading models...");
    require("./models/userModel");
    require("./models/sessionModel");
    require("./models/blastModel");
    require("./models/chatModel");
    require("./models/templateModel");
    require("./models/menuModel");
    require("./models/messageStatusModel");
    require("./models/blacklistedTokenModel");
    require("./models/blastSessionModel");
    require("./models/blastMessageModel");
    require("./models/autoReplyRuleModel");
    require("./models/autoReplyLogModel");
    logger.info("🔗 Setting up model associations...");
    const models = sequelize.models;
    Object.keys(models).forEach((modelName) => {
      if (models[modelName].associate) {
        models[modelName].associate(models);
        logger.info(`✅ Associations set up for ${modelName}`);
      }
    });
    logger.info("✅ All models and associations loaded successfully");

    // Sync auto-reply models separately with safe sync
    const AutoReplyRule = require("./models/autoReplyRuleModel");
    const AutoReplyLog = require("./models/autoReplyLogModel");
    const { safeSync } = require("./utils/safeModelSync");

    logger.info("🔄 Syncing auto-reply models...");
    await safeSync(AutoReplyRule, { alter: false }); // Don't alter, just create if not exists
    await safeSync(AutoReplyLog, { alter: false });

    // Sync other models normally (exclude auto-reply models to avoid conflicts)
    const modelsToSync = Object.keys(sequelize.models).filter(
      (modelName) => !["AutoReplyRule", "AutoReplyLog"].includes(modelName)
    );

    for (const modelName of modelsToSync) {
      await sequelize.models[modelName].sync({ alter: true });
    }

    logger.info("📊 Database synced successfully");

    // Seed default auto-reply rules if not exists
    const { seedDefaultRules } = require("./seeders/seedAutoReplyRules");
    await seedDefaultRules();

    dbHealthCheck.startPeriodicCheck();
    return true;
  } catch (error) {
    logger.error("💥 Database initialization failed:", error.message);
    throw error;
  }
}
async function startApplication() {
  try {
    await initializeDatabase();
    await loadExistingSessions();
    logger.info("📱 All existing sessions loaded");
    fileCleanup.startAutoCleanup();
    logger.info("🧹 File cleanup manager started");
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
process.on("uncaughtException", (error) => {
  logger.error("💥 Uncaught Exception:", error);
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
});
startApplication();
