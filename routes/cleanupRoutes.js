const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/authMiddleware");
const { asyncHandler, AppError } = require("../middleware/errorHandler");
const FileCleanupManager = require("../utils/fileCleanup");
const logger = require("../utils/logger");

// Initialize cleanup manager for routes
const fileCleanup = new FileCleanupManager();

/**
 * Get cleanup statistics
 * GET /cleanup/stats
 */
const getCleanupStats = asyncHandler(async (req, res) => {
  const stats = await fileCleanup.getCleanupStats();

  res.status(200).json({
    status: "success",
    data: {
      ...stats,
      formattedTotalSize: fileCleanup.formatBytes(stats.totalSize),
      directories: Object.fromEntries(
        Object.entries(stats.directories).map(([name, dirStats]) => [
          name,
          {
            ...dirStats,
            formattedSize: dirStats.totalSize
              ? fileCleanup.formatBytes(dirStats.totalSize)
              : "0 Bytes",
            oldestFileAge: dirStats.oldestFile
              ? Date.now() - dirStats.oldestFile
              : null,
            newestFileAge: dirStats.newestFile
              ? Date.now() - dirStats.newestFile
              : null,
          },
        ])
      ),
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Run manual cleanup
 * POST /cleanup/manual
 */
const runManualCleanup = asyncHandler(async (req, res) => {
  const { dryRun = true, maxAge, directories } = req.body;

  // Validate maxAge if provided
  if (maxAge && (isNaN(maxAge) || maxAge < 0)) {
    throw new AppError("maxAge must be a positive number (milliseconds)", 400);
  }

  const options = {
    dryRun: Boolean(dryRun),
    maxAge: maxAge ? parseInt(maxAge) : undefined,
  };

  // Override directories if specified
  if (directories && Array.isArray(directories)) {
    const validDirs = ["uploads", "logs", "sessions", "temp"];
    const invalidDirs = directories.filter((dir) => !validDirs.includes(dir));

    if (invalidDirs.length > 0) {
      throw new AppError(
        `Invalid directories: ${invalidDirs.join(
          ", "
        )}. Valid options: ${validDirs.join(", ")}`,
        400
      );
    }
  }

  logger.info(
    {
      userId: req.user.id,
      username: req.user.username,
      options,
    },
    "Manual cleanup initiated"
  );

  const results = await fileCleanup.manualCleanup(options);

  res.status(200).json({
    status: "success",
    data: {
      ...results,
      formattedFreedSpace: fileCleanup.formatBytes(results.freedSpace),
      dryRun: options.dryRun,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get cleanup configuration
 * GET /cleanup/config
 */
const getCleanupConfig = asyncHandler(async (req, res) => {
  const config = {
    tempFileMaxAge: fileCleanup.options.tempFileMaxAge,
    logFileMaxAge: fileCleanup.options.logFileMaxAge,
    sessionFileMaxAge: fileCleanup.options.sessionFileMaxAge,
    cleanupInterval: fileCleanup.options.cleanupInterval,
    directories: fileCleanup.options.directories,
    maxFilesToDelete: fileCleanup.options.maxFilesToDelete,
    patterns: Object.fromEntries(
      Object.entries(fileCleanup.options.patterns).map(([key, regex]) => [
        key,
        regex.toString(),
      ])
    ),
    isRunning: fileCleanup.isRunning,
    autoCleanupEnabled: fileCleanup.cleanupTimer !== null,
  };

  res.status(200).json({
    status: "success",
    data: config,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Update cleanup configuration
 * PUT /cleanup/config
 */
const updateCleanupConfig = asyncHandler(async (req, res) => {
  const {
    tempFileMaxAge,
    logFileMaxAge,
    sessionFileMaxAge,
    cleanupInterval,
    maxFilesToDelete,
  } = req.body;

  // Validate numeric values
  const numericFields = {
    tempFileMaxAge,
    logFileMaxAge,
    sessionFileMaxAge,
    cleanupInterval,
    maxFilesToDelete,
  };

  for (const [field, value] of Object.entries(numericFields)) {
    if (value !== undefined && (isNaN(value) || value < 0)) {
      throw new AppError(`${field} must be a positive number`, 400);
    }
  }

  // Update configuration
  if (tempFileMaxAge !== undefined)
    fileCleanup.options.tempFileMaxAge = parseInt(tempFileMaxAge);
  if (logFileMaxAge !== undefined)
    fileCleanup.options.logFileMaxAge = parseInt(logFileMaxAge);
  if (sessionFileMaxAge !== undefined)
    fileCleanup.options.sessionFileMaxAge = parseInt(sessionFileMaxAge);
  if (cleanupInterval !== undefined)
    fileCleanup.options.cleanupInterval = parseInt(cleanupInterval);
  if (maxFilesToDelete !== undefined)
    fileCleanup.options.maxFilesToDelete = parseInt(maxFilesToDelete);

  logger.info(
    {
      userId: req.user.id,
      username: req.user.username,
      updatedFields: Object.keys(numericFields).filter(
        (key) => numericFields[key] !== undefined
      ),
    },
    "Cleanup configuration updated"
  );

  res.status(200).json({
    status: "success",
    message: "Configuration updated successfully",
    data: {
      tempFileMaxAge: fileCleanup.options.tempFileMaxAge,
      logFileMaxAge: fileCleanup.options.logFileMaxAge,
      sessionFileMaxAge: fileCleanup.options.sessionFileMaxAge,
      cleanupInterval: fileCleanup.options.cleanupInterval,
      maxFilesToDelete: fileCleanup.options.maxFilesToDelete,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Start/stop auto cleanup
 * POST /cleanup/toggle
 */
const toggleAutoCleanup = asyncHandler(async (req, res) => {
  const { enabled } = req.body;

  if (typeof enabled !== "boolean") {
    throw new AppError("enabled must be a boolean value", 400);
  }

  if (enabled) {
    if (fileCleanup.cleanupTimer) {
      throw new AppError("Auto cleanup is already running", 400);
    }
    fileCleanup.startAutoCleanup();
    logger.info(
      {
        userId: req.user.id,
        username: req.user.username,
      },
      "Auto cleanup started"
    );
  } else {
    if (!fileCleanup.cleanupTimer) {
      throw new AppError("Auto cleanup is not running", 400);
    }
    fileCleanup.stopAutoCleanup();
    logger.info(
      {
        userId: req.user.id,
        username: req.user.username,
      },
      "Auto cleanup stopped"
    );
  }

  res.status(200).json({
    status: "success",
    message: `Auto cleanup ${enabled ? "started" : "stopped"}`,
    data: {
      autoCleanupEnabled: enabled,
    },
    timestamp: new Date().toISOString(),
  });
});

// Routes
router.get("/stats", verifyToken, getCleanupStats);
router.post("/manual", verifyToken, runManualCleanup);
router.get("/config", verifyToken, getCleanupConfig);
router.put("/config", verifyToken, updateCleanupConfig);
router.post("/toggle", verifyToken, toggleAutoCleanup);

module.exports = router;
