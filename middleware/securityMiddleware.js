const logger = require("../utils/logger");
const SecurityUtils = require("../utils/security");
const requestLogger = (req, res, next) => {
  const start = Date.now();
  logger.info(
    {
      method: req.method,
      url: req.url,
      ip: req.ip,
      userAgent: req.get("User-Agent"),
      origin: req.get("Origin"),
      referer: req.get("Referer"),
    },
    "Incoming request"
  );
  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.info(
      {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        ip: req.ip,
      },
      "Request completed"
    );
  });
  next();
};
const securityHeaders = (req, res, next) => {
  res.removeHeader("X-Powered-By");
  res.setHeader("X-Request-ID", req.id || "unknown");
  res.setHeader("X-Response-Time", Date.now());
  next();
};
const sanitizeInput = (req, res, next) => {
  const sanitizeString = (str) => {
    if (typeof str !== "string") return str;
    return str
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
      .replace(/javascript:/gi, "")
      .replace(/on\w+\s*=/gi, "");
  };
  const sanitizeObject = (obj) => {
    if (obj === null || typeof obj !== "object") {
      return sanitizeString(obj);
    }
    if (Array.isArray(obj)) {
      return obj.map(sanitizeObject);
    }
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = sanitizeObject(value);
    }
    return sanitized;
  };
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }
  next();
};
const validateApiKey = (req, res, next) => {
  const apiKey = req.headers["x-api-key"];
  const validApiKeys = process.env.API_KEYS
    ? process.env.API_KEYS.split(",")
    : [];
  if (validApiKeys.length === 0) {
    return next();
  }
  if (!apiKey || !validApiKeys.includes(apiKey)) {
    logger.warn(
      {
        ip: req.ip,
        userAgent: req.get("User-Agent"),
        apiKey: apiKey ? "provided" : "missing",
      },
      "Invalid API key attempt"
    );
    return res.status(401).json({
      status: "error",
      message: "Invalid or missing API key",
    });
  }
  next();
};
const validateOrigin = (allowedOrigins) => {
  return (req, res, next) => {
    const origin = req.get("Origin");
    if (!origin) {
      return next();
    }
    if (!SecurityUtils.isOriginAllowed(origin, allowedOrigins)) {
      logger.warn(
        {
          origin,
          ip: req.ip,
          userAgent: req.get("User-Agent"),
        },
        "Blocked request from unauthorized origin"
      );
      return res.status(403).json({
        status: "error",
        message: "Origin not allowed",
      });
    }
    next();
  };
};
const validateContentType = (req, res, next) => {
  if (!["POST", "PUT", "PATCH"].includes(req.method)) {
    return next();
  }
  const contentType = req.get("Content-Type");
  const contentLength = req.get("Content-Length");
  if (
    ["PATCH", "POST", "PUT"].includes(req.method) &&
    (!contentLength || contentLength === "0")
  ) {
    return next();
  }
  const allowedTypes = [
    "application/json",
    "application/x-www-form-urlencoded",
    "multipart/form-data",
  ];
  if (
    !contentType ||
    !allowedTypes.some((type) => contentType.includes(type))
  ) {
    logger.warn(
      {
        contentType,
        contentLength,
        method: req.method,
        url: req.url,
        ip: req.ip,
        allowedTypes,
      },
      "Invalid content type"
    );
    return res.status(400).json({
      status: "error",
      message: "Invalid content type",
      details: {
        received: contentType,
        allowed: allowedTypes,
        method: req.method,
        contentLength,
      },
    });
  }
  next();
};
const validateRequestSize = (maxSize = "10mb") => {
  return (req, res, next) => {
    const contentLength = req.get("Content-Length");
    if (contentLength) {
      const sizeInBytes = parseInt(contentLength);
      const maxSizeInBytes = parseSize(maxSize);
      if (sizeInBytes > maxSizeInBytes) {
        logger.warn(
          {
            contentLength: sizeInBytes,
            maxSize: maxSizeInBytes,
            ip: req.ip,
            url: req.url,
          },
          "Request size exceeded"
        );
        return res.status(413).json({
          status: "error",
          message: "Request entity too large",
        });
      }
    }
    next();
  };
};
function parseSize(size) {
  const units = {
    b: 1,
    kb: 1024,
    mb: 1024 * 1024,
    gb: 1024 * 1024 * 1024,
  };
  const match = size
    .toString()
    .toLowerCase()
    .match(/^(\d+(?:\.\d+)?)\s*([kmg]?b)$/);
  if (!match) return 0;
  const value = parseFloat(match[1]);
  const unit = match[2];
  return Math.floor(value * (units[unit] || 1));
}
module.exports = {
  requestLogger,
  securityHeaders,
  sanitizeInput,
  validateApiKey,
  validateOrigin,
  validateContentType,
  validateRequestSize,
};
