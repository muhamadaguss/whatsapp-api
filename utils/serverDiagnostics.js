const logger = require("./logger");
const sequelize = require("../models/db");
const fs = require("fs").promises;
const path = require("path");
class ServerDiagnostics {
  constructor() {
    this.diagnosticResults = {};
  }
  async runDiagnostics() {
    logger.info("🔍 Running server diagnostics...");
    const results = {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || "unknown",
      diagnostics: {},
    };
    results.diagnostics.database = await this.checkDatabase();
    results.diagnostics.filesystem = await this.checkFileSystem();
    results.diagnostics.environment = await this.checkEnvironment();
    results.diagnostics.network = await this.checkNetwork();
    results.diagnostics.memory = await this.checkMemory();
    this.diagnosticResults = results;
    this.logDiagnosticResults(results);
    return results;
  }
  async checkDatabase() {
    const dbDiagnostics = {
      status: "unknown",
      connection: false,
      config: {},
      errors: [],
    };
    try {
      dbDiagnostics.config = {
        host: process.env.DB_HOST || "not set",
        port: process.env.DB_PORT || "not set",
        database: process.env.DB_NAME || "not set",
        user: process.env.DB_USER || "not set",
        password: process.env.DB_PASS ? "***set***" : "not set",
      };
      await sequelize.authenticate();
      dbDiagnostics.connection = true;
      dbDiagnostics.status = "healthy";
      const [results] = await sequelize.query("SELECT version() as version");
      dbDiagnostics.version = results[0]?.version || "unknown";
    } catch (error) {
      dbDiagnostics.status = "error";
      dbDiagnostics.connection = false;
      dbDiagnostics.errors.push({
        message: error.message,
        code: error.code || "unknown",
        errno: error.errno || "unknown",
      });
      if (error.code === "ECONNREFUSED") {
        dbDiagnostics.errors.push({
          suggestion: "Database server is not running or not accessible",
          action: "Check if PostgreSQL service is running and accessible",
        });
      } else if (error.code === "ENOTFOUND") {
        dbDiagnostics.errors.push({
          suggestion: "Database host not found",
          action: "Verify DB_HOST environment variable and DNS resolution",
        });
      } else if (error.message.includes("authentication")) {
        dbDiagnostics.errors.push({
          suggestion: "Authentication failed",
          action: "Check DB_USER and DB_PASS environment variables",
        });
      }
    }
    return dbDiagnostics;
  }
  async checkFileSystem() {
    const fsDiagnostics = {
      status: "unknown",
      directories: {},
      permissions: {},
      errors: [],
    };
    const requiredDirs = ["./uploads", "./logs", "./sessions", "./temp"];
    try {
      for (const dir of requiredDirs) {
        const dirPath = path.resolve(dir);
        const dirInfo = {
          exists: false,
          readable: false,
          writable: false,
          size: 0,
          files: 0,
        };
        try {
          const stats = await fs.stat(dirPath);
          dirInfo.exists = stats.isDirectory();
          if (dirInfo.exists) {
            try {
              await fs.access(dirPath, fs.constants.R_OK);
              dirInfo.readable = true;
            } catch (e) {
              dirInfo.readable = false;
            }
            try {
              await fs.access(dirPath, fs.constants.W_OK);
              dirInfo.writable = true;
            } catch (e) {
              dirInfo.writable = false;
            }
            try {
              const files = await fs.readdir(dirPath);
              dirInfo.files = files.length;
              let totalSize = 0;
              for (const file of files) {
                try {
                  const filePath = path.join(dirPath, file);
                  const fileStats = await fs.stat(filePath);
                  if (fileStats.isFile()) {
                    totalSize += fileStats.size;
                  }
                } catch (e) {
                }
              }
              dirInfo.size = totalSize;
            } catch (e) {
              fsDiagnostics.errors.push({
                directory: dir,
                error: `Cannot read directory contents: ${e.message}`,
              });
            }
          }
        } catch (error) {
          if (error.code === "ENOENT") {
            try {
              await fs.mkdir(dirPath, { recursive: true });
              dirInfo.exists = true;
              dirInfo.readable = true;
              dirInfo.writable = true;
            } catch (createError) {
              fsDiagnostics.errors.push({
                directory: dir,
                error: `Cannot create directory: ${createError.message}`,
              });
            }
          } else {
            fsDiagnostics.errors.push({
              directory: dir,
              error: error.message,
            });
          }
        }
        fsDiagnostics.directories[dir] = dirInfo;
      }
      const hasErrors = fsDiagnostics.errors.length > 0;
      const allDirsOk = Object.values(fsDiagnostics.directories).every(
        (dir) => dir.exists && dir.readable && dir.writable
      );
      fsDiagnostics.status = hasErrors || !allDirsOk ? "warning" : "healthy";
    } catch (error) {
      fsDiagnostics.status = "error";
      fsDiagnostics.errors.push({
        error: `File system check failed: ${error.message}`,
      });
    }
    return fsDiagnostics;
  }
  async checkEnvironment() {
    const envDiagnostics = {
      status: "unknown",
      required: {},
      optional: {},
      errors: [],
    };
    const requiredVars = {
      DB_NAME: "Database name",
      DB_USER: "Database username",
      DB_PASS: "Database password",
      DB_HOST: "Database host",
      JWT_SECRET: "JWT secret key",
    };
    const optionalVars = {
      PORT: "Server port",
      DB_PORT: "Database port",
      NODE_ENV: "Environment mode",
      ALLOWED_ORIGINS: "CORS allowed origins",
      CLEANUP_DRY_RUN: "File cleanup dry run mode",
    };
    for (const [varName, description] of Object.entries(requiredVars)) {
      const value = process.env[varName];
      envDiagnostics.required[varName] = {
        description,
        set: !!value,
        length: value ? value.length : 0,
        value:
          varName.includes("PASS") || varName.includes("SECRET")
            ? value
              ? "***set***"
              : "not set"
            : value || "not set",
      };
      if (!value) {
        envDiagnostics.errors.push({
          variable: varName,
          error: `Required environment variable not set: ${varName}`,
        });
      }
    }
    for (const [varName, description] of Object.entries(optionalVars)) {
      const value = process.env[varName];
      envDiagnostics.optional[varName] = {
        description,
        set: !!value,
        value: value || "not set",
      };
    }
    envDiagnostics.status =
      envDiagnostics.errors.length > 0 ? "error" : "healthy";
    return envDiagnostics;
  }
  async checkNetwork() {
    const networkDiagnostics = {
      status: "unknown",
      port: process.env.PORT || 3000,
      hostname: require("os").hostname(),
      interfaces: {},
      errors: [],
    };
    try {
      const os = require("os");
      const networkInterfaces = os.networkInterfaces();
      for (const [name, interfaces] of Object.entries(networkInterfaces)) {
        networkDiagnostics.interfaces[name] = interfaces
          .filter((iface) => !iface.internal)
          .map((iface) => ({
            address: iface.address,
            family: iface.family,
            mac: iface.mac,
          }));
      }
      networkDiagnostics.status = "healthy";
    } catch (error) {
      networkDiagnostics.status = "error";
      networkDiagnostics.errors.push({
        error: `Network check failed: ${error.message}`,
      });
    }
    return networkDiagnostics;
  }
  async checkMemory() {
    const memoryDiagnostics = {
      status: "unknown",
      process: {},
      system: {},
      errors: [],
    };
    try {
      const processMemory = process.memoryUsage();
      memoryDiagnostics.process = {
        heapUsed: Math.round(processMemory.heapUsed / 1024 / 1024) + " MB",
        heapTotal: Math.round(processMemory.heapTotal / 1024 / 1024) + " MB",
        external: Math.round(processMemory.external / 1024 / 1024) + " MB",
        rss: Math.round(processMemory.rss / 1024 / 1024) + " MB",
      };
      const os = require("os");
      const totalMemory = os.totalmem();
      const freeMemory = os.freemem();
      const usedMemory = totalMemory - freeMemory;
      memoryDiagnostics.system = {
        total: Math.round(totalMemory / 1024 / 1024) + " MB",
        used: Math.round(usedMemory / 1024 / 1024) + " MB",
        free: Math.round(freeMemory / 1024 / 1024) + " MB",
        usage: Math.round((usedMemory / totalMemory) * 100) + "%",
      };
      const memoryUsagePercent = (usedMemory / totalMemory) * 100;
      if (memoryUsagePercent > 90) {
        memoryDiagnostics.errors.push({
          error: `High memory usage: ${memoryUsagePercent.toFixed(1)}%`,
        });
      }
      memoryDiagnostics.status =
        memoryDiagnostics.errors.length > 0 ? "warning" : "healthy";
    } catch (error) {
      memoryDiagnostics.status = "error";
      memoryDiagnostics.errors.push({
        error: `Memory check failed: ${error.message}`,
      });
    }
    return memoryDiagnostics;
  }
  logDiagnosticResults(results) {
    logger.info("📊 Server Diagnostics Results:");
    logger.info(`   Environment: ${results.environment}`);
    const db = results.diagnostics.database;
    if (db.status === "healthy") {
      logger.info(
        `   ✅ Database: Connected to ${db.config.host}:${db.config.port}`
      );
    } else {
      logger.error(`   ❌ Database: Connection failed`);
      db.errors.forEach((error) => {
        logger.error(`      - ${error.message}`);
        if (error.suggestion) {
          logger.error(`      - Suggestion: ${error.suggestion}`);
        }
      });
    }
    const fs = results.diagnostics.filesystem;
    if (fs.status === "healthy") {
      logger.info(`   ✅ File System: All directories accessible`);
    } else {
      logger.warn(`   ⚠️ File System: Issues detected`);
      fs.errors.forEach((error) => {
        logger.warn(`      - ${error.directory}: ${error.error}`);
      });
    }
    const env = results.diagnostics.environment;
    if (env.status === "healthy") {
      logger.info(`   ✅ Environment: All required variables set`);
    } else {
      logger.error(`   ❌ Environment: Missing variables`);
      env.errors.forEach((error) => {
        logger.error(`      - ${error.variable}: ${error.error}`);
      });
    }
    const mem = results.diagnostics.memory;
    logger.info(
      `   📊 Memory: Process ${mem.process.rss}, System ${mem.system.usage}`
    );
  }
  getDiagnosticResults() {
    return this.diagnosticResults;
  }
}
module.exports = ServerDiagnostics;
