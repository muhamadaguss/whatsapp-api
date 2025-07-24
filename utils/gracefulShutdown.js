const logger = require("./logger");

/**
 * Enhanced Graceful Shutdown Manager
 */
class GracefulShutdownManager {
  constructor() {
    this.shutdownHandlers = [];
    this.isShuttingDown = false;
    this.shutdownTimeout = 30000; // 30 seconds default
    this.shutdownStartTime = null;
    this.forceShutdownTimer = null;
    this.activeConnections = new Set();
    this.shutdownPromise = null;
    this.signalHandlersSetup = false;
  }

  /**
   * Register a shutdown handler
   * @param {string} name - Handler name for logging
   * @param {Function} handler - Async function to execute during shutdown
   * @param {number} priority - Priority (lower number = higher priority)
   */
  registerHandler(name, handler, priority = 100) {
    this.shutdownHandlers.push({
      name,
      handler,
      priority,
      executed: false,
      startTime: null,
      endTime: null,
      error: null,
    });

    // Sort by priority (lower number = higher priority)
    this.shutdownHandlers.sort((a, b) => a.priority - b.priority);

    logger.debug(
      `Registered shutdown handler: ${name} (priority: ${priority})`
    );
  }

  /**
   * Set shutdown timeout
   * @param {number} timeout - Timeout in milliseconds
   */
  setShutdownTimeout(timeout) {
    this.shutdownTimeout = timeout;
    logger.debug(`Shutdown timeout set to ${timeout}ms`);
  }

  /**
   * Track active connections
   * @param {Object} connection - Connection object
   */
  trackConnection(connection) {
    this.activeConnections.add(connection);

    // Remove connection when it closes
    connection.on("close", () => {
      this.activeConnections.delete(connection);
    });
  }

  /**
   * Get shutdown statistics
   */
  getShutdownStats() {
    return {
      isShuttingDown: this.isShuttingDown,
      activeConnections: this.activeConnections.size,
      registeredHandlers: this.shutdownHandlers.length,
      shutdownTimeout: this.shutdownTimeout,
      shutdownDuration: this.shutdownStartTime
        ? Date.now() - this.shutdownStartTime
        : null,
    };
  }

  /**
   * Execute graceful shutdown
   * @param {string} signal - Signal that triggered shutdown
   */
  async executeShutdown(signal) {
    if (this.isShuttingDown) {
      logger.warn(`Shutdown already in progress, ignoring ${signal}`);
      return this.shutdownPromise;
    }

    this.isShuttingDown = true;
    this.shutdownStartTime = Date.now();

    logger.info(`🛑 Received ${signal}. Starting graceful shutdown...`);
    logger.info(
      `📊 Shutdown stats: ${this.activeConnections.size} active connections, ${this.shutdownHandlers.length} handlers`
    );

    // Set force shutdown timer
    this.forceShutdownTimer = setTimeout(() => {
      logger.error(
        `⏰ Forced shutdown after ${this.shutdownTimeout}ms timeout`
      );
      this.forceShutdown();
    }, this.shutdownTimeout);

    this.shutdownPromise = this.performShutdown(signal);
    return this.shutdownPromise;
  }

  /**
   * Perform the actual shutdown process
   */
  async performShutdown(signal) {
    const shutdownResults = {
      signal,
      startTime: this.shutdownStartTime,
      handlers: [],
      totalDuration: 0,
      success: false,
    };

    try {
      // Execute shutdown handlers in priority order
      for (const handler of this.shutdownHandlers) {
        if (handler.executed) continue;

        handler.startTime = Date.now();
        logger.info(`🔄 Executing shutdown handler: ${handler.name}`);

        try {
          await Promise.race([
            handler.handler(),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Handler timeout")), 10000)
            ),
          ]);

          handler.endTime = Date.now();
          handler.executed = true;

          const duration = handler.endTime - handler.startTime;
          logger.info(
            `✅ Shutdown handler completed: ${handler.name} (${duration}ms)`
          );
        } catch (error) {
          handler.error = error;
          handler.endTime = Date.now();

          const duration = handler.endTime - handler.startTime;
          logger.error(
            `❌ Shutdown handler failed: ${handler.name} (${duration}ms)`,
            error
          );
        }

        shutdownResults.handlers.push({
          name: handler.name,
          duration: handler.endTime - handler.startTime,
          success: !handler.error,
          error: handler.error?.message,
        });
      }

      // Wait for active connections to close (with timeout)
      await this.waitForConnectionsToClose();

      // Clear force shutdown timer
      if (this.forceShutdownTimer) {
        clearTimeout(this.forceShutdownTimer);
        this.forceShutdownTimer = null;
      }

      shutdownResults.totalDuration = Date.now() - this.shutdownStartTime;
      shutdownResults.success = true;

      logger.info(
        {
          signal: shutdownResults.signal,
          duration: `${shutdownResults.totalDuration}ms`,
          handlersExecuted: shutdownResults.handlers.length,
          successfulHandlers: shutdownResults.handlers.filter((h) => h.success)
            .length,
          failedHandlers: shutdownResults.handlers.filter((h) => !h.success)
            .length,
        },
        "✅ Graceful shutdown completed"
      );

      process.exit(0);
    } catch (error) {
      shutdownResults.totalDuration = Date.now() - this.shutdownStartTime;
      shutdownResults.error = error.message;

      logger.error(
        {
          signal: shutdownResults.signal,
          duration: `${shutdownResults.totalDuration}ms`,
          error: error.message,
        },
        "💥 Graceful shutdown failed"
      );

      this.forceShutdown();
    }
  }

  /**
   * Wait for active connections to close
   */
  async waitForConnectionsToClose(timeout = 5000) {
    if (this.activeConnections.size === 0) {
      logger.info("🔌 No active connections to close");
      return;
    }

    logger.info(
      `⏳ Waiting for ${this.activeConnections.size} active connections to close...`
    );

    const startTime = Date.now();

    return new Promise((resolve) => {
      const checkConnections = () => {
        if (this.activeConnections.size === 0) {
          logger.info("🔌 All connections closed gracefully");
          resolve();
          return;
        }

        if (Date.now() - startTime > timeout) {
          logger.warn(
            `⚠️ Timeout waiting for connections, ${this.activeConnections.size} still active`
          );
          resolve();
          return;
        }

        setTimeout(checkConnections, 100);
      };

      checkConnections();
    });
  }

  /**
   * Force shutdown
   */
  forceShutdown() {
    logger.error("💥 Forcing immediate shutdown");

    // Close all active connections
    for (const connection of this.activeConnections) {
      try {
        if (connection.destroy) {
          connection.destroy();
        } else if (connection.close) {
          connection.close();
        }
      } catch (error) {
        logger.error("Error closing connection during force shutdown:", error);
      }
    }

    process.exit(1);
  }

  /**
   * Setup signal handlers
   */
  setupSignalHandlers() {
    // Check if handlers are already set up
    if (this.signalHandlersSetup) {
      logger.warn("Signal handlers already set up, skipping");
      return;
    }

    try {
      // Graceful shutdown signals
      const gracefulSignals = ["SIGTERM", "SIGINT"];

      gracefulSignals.forEach((signal) => {
        // Remove existing listeners to prevent duplicates
        process.removeAllListeners(signal);

        process.on(signal, () => {
          this.executeShutdown(signal);
        });
      });

      // Handle uncaught exceptions
      process.removeAllListeners("uncaughtException");
      process.on("uncaughtException", (error) => {
        logger.error("💥 Uncaught Exception:", error);
        this.executeShutdown("uncaughtException");
      });

      // Handle unhandled promise rejections
      process.removeAllListeners("unhandledRejection");
      process.on("unhandledRejection", (reason, promise) => {
        logger.error("💥 Unhandled Rejection at:", promise, "reason:", reason);
        this.executeShutdown("unhandledRejection");
      });

      // Handle warning events
      process.removeAllListeners("warning");
      process.on("warning", (warning) => {
        logger.warn("⚠️ Process Warning:", {
          name: warning.name,
          message: warning.message,
          stack: warning.stack,
        });
      });

      this.signalHandlersSetup = true;
      logger.info("🛡️ Signal handlers registered for graceful shutdown");
    } catch (error) {
      logger.error("❌ Failed to setup signal handlers:", error.message);
      throw error;
    }
  }

  /**
   * Health check for shutdown manager
   */
  healthCheck() {
    return {
      status: this.isShuttingDown ? "shutting_down" : "healthy",
      stats: this.getShutdownStats(),
      handlers: this.shutdownHandlers.map((h) => ({
        name: h.name,
        priority: h.priority,
        executed: h.executed,
      })),
    };
  }
}

module.exports = GracefulShutdownManager;
