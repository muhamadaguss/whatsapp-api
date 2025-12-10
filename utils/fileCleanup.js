const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");
const logger = require("./logger");
class FileCleanupManager {
  constructor(options = {}) {
    this.options = {
      tempFileMaxAge: options.tempFileMaxAge || 24 * 60 * 60 * 1000, 
      logFileMaxAge: options.logFileMaxAge || 7 * 24 * 60 * 60 * 1000, 
      sessionFileMaxAge: options.sessionFileMaxAge || 30 * 24 * 60 * 60 * 1000, 
      cleanupInterval: options.cleanupInterval || 60 * 60 * 1000, 
      directories: {
        uploads: options.uploadsDir || "./uploads",
        logs: options.logsDir || "./logs",
        sessions: options.sessionsDir || "./sessions",
        temp: options.tempDir || "./temp",
      },
      patterns: {
        tempFiles: /\.(tmp|temp)$/i,
        logFiles: /\.log$/i,
        uploadFiles: /\.(xlsx|xls|csv)$/i,
        backupFiles: /\.bak$/i,
      },
      maxFilesToDelete: options.maxFilesToDelete || 100,
      dryRun: options.dryRun || false,
    };
    this.cleanupTimer = null;
    this.isRunning = false;
  }
  startAutoCleanup() {
    if (this.cleanupTimer) {
      logger.warn("File cleanup already running");
      return;
    }
    logger.info(
      `🧹 Starting automatic file cleanup (interval: ${this.options.cleanupInterval}ms)`
    );
    this.runCleanup().catch((err) => {
      logger.error("Initial cleanup failed:", err);
    });
    this.cleanupTimer = setInterval(() => {
      this.runCleanup().catch((err) => {
        logger.error("Scheduled cleanup failed:", err);
      });
    }, this.options.cleanupInterval);
  }
  stopAutoCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      logger.info("🛑 File cleanup stopped");
    }
  }
  async runCleanup() {
    if (this.isRunning) {
      logger.warn("Cleanup already in progress, skipping");
      return;
    }
    this.isRunning = true;
    const startTime = Date.now();
    try {
      logger.info("🧹 Starting file cleanup process");
      const results = {
        totalFiles: 0,
        deletedFiles: 0,
        freedSpace: 0,
        errors: [],
      };
      await this.cleanUploadsDirectory(results);
      await this.cleanLogsDirectory(results);
      await this.cleanSessionsDirectory(results);
      await this.cleanTempDirectory(results);
      await this.cleanOrphanedFiles(results);
      const duration = Date.now() - startTime;
      logger.info(
        {
          duration: `${duration}ms`,
          totalFiles: results.totalFiles,
          deletedFiles: results.deletedFiles,
          freedSpace: this.formatBytes(results.freedSpace),
          errors: results.errors.length,
        },
        "✅ File cleanup completed"
      );
      if (results.errors.length > 0) {
        logger.warn("Cleanup errors:", results.errors);
      }
      return results;
    } catch (error) {
      logger.error("File cleanup failed:", error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }
  async cleanUploadsDirectory(results) {
    const uploadsDir = this.options.directories.uploads;
    try {
      await this.ensureDirectoryExists(uploadsDir);
      const files = await this.getFilesInDirectory(uploadsDir);
      for (const file of files) {
        const filePath = path.join(uploadsDir, file.name);
        const fileAge = Date.now() - file.mtime.getTime();
        if (
          fileAge > this.options.tempFileMaxAge &&
          this.options.patterns.uploadFiles.test(file.name)
        ) {
          await this.deleteFile(
            filePath,
            file.size,
            results,
            "old upload file"
          );
        }
        if (this.options.patterns.tempFiles.test(file.name)) {
          await this.deleteFile(filePath, file.size, results, "temporary file");
        }
      }
    } catch (error) {
      results.errors.push(`Uploads cleanup error: ${error.message}`);
      logger.error("Error cleaning uploads directory:", error);
    }
  }
  async cleanLogsDirectory(results) {
    const logsDir = this.options.directories.logs;
    try {
      await this.ensureDirectoryExists(logsDir);
      try {
        await fs.access(logsDir, fsSync.constants.R_OK | fsSync.constants.W_OK);
      } catch (accessError) {
        logger.warn(
          `Cannot access logs directory ${logsDir}: ${accessError.message}`
        );
        return; 
      }
      const files = await this.getFilesInDirectory(logsDir);
      for (const file of files) {
        const filePath = path.join(logsDir, file.name);
        const fileAge = Date.now() - file.mtime.getTime();
        if (
          fileAge > this.options.logFileMaxAge &&
          this.options.patterns.logFiles.test(file.name)
        ) {
          await this.deleteFile(filePath, file.size, results, "old log file");
        }
      }
      logger.debug(
        `✅ Logs directory cleanup completed: ${files.length} files processed`
      );
    } catch (error) {
      results.errors.push(`Logs cleanup error: ${error.message}`);
      logger.warn(`⚠️ Error cleaning logs directory: ${error.message}`);
    }
  }
  async cleanSessionsDirectory(results) {
    const sessionsDir = this.options.directories.sessions;
    try {
      await this.ensureDirectoryExists(sessionsDir);
      const files = await this.getFilesInDirectory(sessionsDir, true); 
      for (const file of files) {
        const filePath = path.join(sessionsDir, file.name);
        const fileAge = Date.now() - file.mtime.getTime();
        if (fileAge > this.options.sessionFileMaxAge) {
          if (file.isDirectory) {
            await this.deleteDirectory(
              filePath,
              results,
              "old session directory"
            );
          } else {
            await this.deleteFile(
              filePath,
              file.size,
              results,
              "old session file"
            );
          }
        }
      }
    } catch (error) {
      results.errors.push(`Sessions cleanup error: ${error.message}`);
      logger.error("Error cleaning sessions directory:", error);
    }
  }
  async cleanTempDirectory(results) {
    const tempDir = this.options.directories.temp;
    try {
      await this.ensureDirectoryExists(tempDir);
      try {
        await fs.access(tempDir, fsSync.constants.R_OK | fsSync.constants.W_OK);
      } catch (accessError) {
        logger.warn(
          `Cannot access temp directory ${tempDir}: ${accessError.message}`
        );
        return; 
      }
      const files = await this.getFilesInDirectory(tempDir);
      for (const file of files) {
        const filePath = path.join(tempDir, file.name);
        const fileAge = Date.now() - file.mtime.getTime();
        if (fileAge > this.options.tempFileMaxAge) {
          await this.deleteFile(filePath, file.size, results, "temp file");
        }
      }
      logger.debug(
        `✅ Temp directory cleanup completed: ${files.length} files processed`
      );
    } catch (error) {
      results.errors.push(`Temp cleanup error: ${error.message}`);
      logger.warn(`⚠️ Error cleaning temp directory: ${error.message}`);
    }
  }
  async cleanOrphanedFiles(results) {
    try {
      const uploadsDir = this.options.directories.uploads;
      const files = await this.getFilesInDirectory(uploadsDir);
      for (const file of files) {
        if (
          /^[a-f0-9]{32}$/.test(file.name) ||
          /^[a-f0-9]{40}$/.test(file.name)
        ) {
          const filePath = path.join(uploadsDir, file.name);
          const fileAge = Date.now() - file.mtime.getTime();
          if (fileAge > 60 * 60 * 1000) {
            await this.deleteFile(
              filePath,
              file.size,
              results,
              "orphaned file"
            );
          }
        }
      }
    } catch (error) {
      results.errors.push(`Orphaned files cleanup error: ${error.message}`);
      logger.error("Error cleaning orphaned files:", error);
    }
  }
  async deleteFile(filePath, fileSize, results, reason) {
    try {
      if (results.deletedFiles >= this.options.maxFilesToDelete) {
        logger.warn(
          `Reached maximum deletion limit (${this.options.maxFilesToDelete}), skipping: ${filePath}`
        );
        return;
      }
      if (this.options.dryRun) {
        logger.info(
          `[DRY RUN] Would delete ${reason}: ${filePath} (${this.formatBytes(
            fileSize
          )})`
        );
      } else {
        await fs.unlink(filePath);
        logger.debug(
          `Deleted ${reason}: ${filePath} (${this.formatBytes(fileSize)})`
        );
      }
      results.deletedFiles++;
      results.freedSpace += fileSize || 0;
    } catch (error) {
      results.errors.push(`Failed to delete ${filePath}: ${error.message}`);
      logger.error(`Error deleting file ${filePath}:`, error);
    }
  }
  async deleteDirectory(dirPath, results, reason) {
    try {
      if (results.deletedFiles >= this.options.maxFilesToDelete) {
        logger.warn(
          `Reached maximum deletion limit, skipping directory: ${dirPath}`
        );
        return;
      }
      if (this.options.dryRun) {
        logger.info(`[DRY RUN] Would delete ${reason}: ${dirPath}`);
      } else {
        await fs.rmdir(dirPath, { recursive: true });
        logger.debug(`Deleted ${reason}: ${dirPath}`);
      }
      results.deletedFiles++;
    } catch (error) {
      results.errors.push(
        `Failed to delete directory ${dirPath}: ${error.message}`
      );
      logger.error(`Error deleting directory ${dirPath}:`, error);
    }
  }
  async getFilesInDirectory(dirPath, includeDirectories = false) {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const files = [];
      for (const entry of entries) {
        if (entry.isFile() || (includeDirectories && entry.isDirectory())) {
          const filePath = path.join(dirPath, entry.name);
          const stats = await fs.stat(filePath);
          files.push({
            name: entry.name,
            size: stats.size,
            mtime: stats.mtime,
            isDirectory: entry.isDirectory(),
          });
        }
      }
      return files;
    } catch (error) {
      if (error.code === "ENOENT") {
        return []; 
      }
      throw error;
    }
  }
  async ensureDirectoryExists(dirPath) {
    try {
      await fs.access(dirPath);
    } catch (error) {
      if (error.code === "ENOENT") {
        try {
          await fs.mkdir(dirPath, { recursive: true, mode: 0o755 });
          logger.debug(`📁 Created directory: ${dirPath}`);
        } catch (mkdirError) {
          logger.warn(
            `⚠️ Could not create directory ${dirPath}: ${mkdirError.message}`
          );
          throw mkdirError;
        }
      } else if (error.code === "EACCES") {
        logger.warn(`⚠️ Permission denied accessing directory: ${dirPath}`);
        throw error;
      } else {
        throw error;
      }
    }
  }
  formatBytes(bytes) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }
  async getCleanupStats() {
    const stats = {
      directories: {},
      totalFiles: 0,
      totalSize: 0,
    };
    for (const [name, dirPath] of Object.entries(this.options.directories)) {
      try {
        const files = await this.getFilesInDirectory(dirPath);
        const dirStats = {
          fileCount: files.length,
          totalSize: files.reduce((sum, file) => sum + (file.size || 0), 0),
          oldestFile:
            files.length > 0
              ? Math.min(...files.map((f) => f.mtime.getTime()))
              : null,
          newestFile:
            files.length > 0
              ? Math.max(...files.map((f) => f.mtime.getTime()))
              : null,
        };
        stats.directories[name] = dirStats;
        stats.totalFiles += dirStats.fileCount;
        stats.totalSize += dirStats.totalSize;
      } catch (error) {
        stats.directories[name] = { error: error.message };
      }
    }
    return stats;
  }
  async manualCleanup(options = {}) {
    const originalOptions = { ...this.options };
    if (options.dryRun !== undefined) this.options.dryRun = options.dryRun;
    if (options.maxAge) {
      this.options.tempFileMaxAge = options.maxAge;
      this.options.logFileMaxAge = options.maxAge;
    }
    try {
      const results = await this.runCleanup();
      return results;
    } finally {
      this.options = originalOptions;
    }
  }
}
module.exports = FileCleanupManager;
