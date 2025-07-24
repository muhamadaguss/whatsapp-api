const logger = require("../utils/logger");

/**
 * Middleware to handle requests during shutdown
 */
function shutdownMiddleware(shutdownManager) {
  return (req, res, next) => {
    if (shutdownManager.isShuttingDown) {
      logger.warn(
        {
          method: req.method,
          url: req.url,
          ip: req.ip,
          userAgent: req.get("User-Agent"),
        },
        "Request rejected - application is shutting down"
      );

      // Set appropriate headers
      res.set({
        Connection: "close",
        "X-Shutdown-Status": "shutting-down",
      });

      // Return 503 Service Unavailable
      return res.status(503).json({
        status: "error",
        message: "Service is shutting down",
        code: "SERVICE_SHUTTING_DOWN",
        retryAfter: 60, // Suggest retry after 60 seconds
      });
    }

    // Add shutdown status to response headers
    res.set("X-Shutdown-Status", "healthy");
    next();
  };
}

/**
 * Middleware to track active requests during shutdown
 */
function requestTrackingMiddleware(shutdownManager) {
  return (req, res, next) => {
    // Track this request
    const requestId = `${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    req.requestId = requestId;

    // Add to active requests
    const requestInfo = {
      id: requestId,
      method: req.method,
      url: req.url,
      startTime: Date.now(),
      ip: req.ip,
      userAgent: req.get("User-Agent"),
    };

    shutdownManager.activeRequests =
      shutdownManager.activeRequests || new Map();
    shutdownManager.activeRequests.set(requestId, requestInfo);

    // Remove from active requests when response finishes
    res.on("finish", () => {
      if (shutdownManager.activeRequests) {
        shutdownManager.activeRequests.delete(requestId);
      }
    });

    // Remove from active requests on connection close
    res.on("close", () => {
      if (shutdownManager.activeRequests) {
        shutdownManager.activeRequests.delete(requestId);
      }
    });

    next();
  };
}

/**
 * Middleware to add graceful shutdown headers
 */
function shutdownHeadersMiddleware(shutdownManager) {
  return (req, res, next) => {
    // Add shutdown-related headers
    res.set({
      "X-Process-ID": process.pid,
      "X-Uptime": Math.floor(process.uptime()),
      "X-Memory-Usage":
        Math.floor(process.memoryUsage().heapUsed / 1024 / 1024) + "MB",
    });

    // Add shutdown timeout header if shutting down
    if (shutdownManager.isShuttingDown) {
      const remainingTime =
        shutdownManager.shutdownTimeout -
        (Date.now() - shutdownManager.shutdownStartTime);
      res.set(
        "X-Shutdown-Remaining",
        Math.max(0, Math.floor(remainingTime / 1000))
      );
    }

    next();
  };
}

module.exports = {
  shutdownMiddleware,
  requestTrackingMiddleware,
  shutdownHeadersMiddleware,
};
