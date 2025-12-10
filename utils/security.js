const crypto = require("crypto");
const logger = require("./logger");
class SecurityUtils {
  static generateJWTSecret(length = 64) {
    return crypto.randomBytes(length).toString("hex");
  }
  static validateJWTSecret(secret) {
    const result = {
      valid: true,
      score: 0,
      issues: [],
      recommendations: [],
    };
    if (secret.length < 32) {
      result.valid = false;
      result.issues.push("JWT secret is too short (minimum 32 characters)");
      result.recommendations.push(
        "Use at least 32 characters for development, 64+ for production"
      );
    } else if (secret.length < 64) {
      result.score += 1;
      result.recommendations.push(
        "Consider using 64+ characters for better security"
      );
    } else {
      result.score += 2;
    }
    const weakPatterns = [
      /^(password|secret|key|token)/i,
      /^(123|abc|test|demo)/i,
      /^(.)\1{10,}/, 
      /^(qwerty|asdf|zxcv)/i,
    ];
    weakPatterns.forEach((pattern) => {
      if (pattern.test(secret)) {
        result.valid = false;
        result.issues.push("JWT secret contains weak patterns");
        result.recommendations.push(
          "Use a cryptographically secure random string"
        );
      }
    });
    const uniqueChars = new Set(secret.toLowerCase()).size;
    if (uniqueChars < 10) {
      result.issues.push("JWT secret has low character diversity");
      result.recommendations.push("Use a mix of letters, numbers, and symbols");
    } else {
      result.score += 1;
    }
    if (/^[a-f0-9]+$/i.test(secret)) {
      result.score += 1;
    }
    return result;
  }
  static validateCORSOrigins(origins) {
    const result = {
      valid: true,
      issues: [],
      recommendations: [],
    };
    origins.forEach((origin, index) => {
      if (origin === "*") {
        result.issues.push(
          "Wildcard CORS origin (*) is not secure for production"
        );
        result.recommendations.push(
          "Specify exact origins instead of using wildcard"
        );
      }
      if (
        process.env.NODE_ENV === "production" &&
        origin.includes("localhost")
      ) {
        result.issues.push(`Localhost origin found in production: ${origin}`);
        result.recommendations.push("Remove localhost origins in production");
      }
      if (
        process.env.NODE_ENV === "production" &&
        origin.startsWith("http://") &&
        !origin.includes("localhost")
      ) {
        result.issues.push(`Insecure HTTP origin in production: ${origin}`);
        result.recommendations.push("Use HTTPS origins in production");
      }
      try {
        new URL(origin);
      } catch (error) {
        result.valid = false;
        result.issues.push(`Invalid origin URL format: ${origin}`);
      }
    });
    return result;
  }
  static generateCORSConfig(allowedOrigins = [], options = {}) {
    const isProduction = process.env.NODE_ENV === "production";
    const validation = this.validateCORSOrigins(allowedOrigins);
    if (!validation.valid) {
      logger.error("CORS configuration validation failed:", validation.issues);
      throw new Error("Invalid CORS origins configuration");
    }
    validation.issues.forEach((issue) => logger.warn(`CORS Warning: ${issue}`));
    validation.recommendations.forEach((rec) =>
      logger.info(`CORS Recommendation: ${rec}`)
    );
    const corsConfig = {
      origin: function (origin, callback) {
        if (!origin) {
          return callback(null, true);
        }
        if (allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          logger.warn(`CORS blocked origin: ${origin}`);
          callback(new Error(`Origin ${origin} not allowed by CORS`));
        }
      },
      credentials: true,
      methods: options.methods || [
        "GET",
        "POST",
        "PUT",
        "PATCH",
        "DELETE",
        "OPTIONS",
      ],
      allowedHeaders: options.allowedHeaders || [
        "Origin",
        "X-Requested-With",
        "Content-Type",
        "Accept",
        "Authorization",
      ],
      exposedHeaders: options.exposedHeaders || ["X-Total-Count"],
      maxAge: isProduction ? 86400 : 300, 
      preflightContinue: false,
      optionsSuccessStatus: 204,
    };
    return corsConfig;
  }
  static generateSecurityHeaders() {
    const isProduction = process.env.NODE_ENV === "production";
    return {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false, 
      crossOriginOpenerPolicy: { policy: "same-origin" },
      crossOriginResourcePolicy: { policy: "cross-origin" },
      dnsPrefetchControl: { allow: false },
      frameguard: { action: "deny" },
      hidePoweredBy: true,
      hsts: isProduction
        ? {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true,
          }
        : false,
      ieNoOpen: true,
      noSniff: true,
      originAgentCluster: true,
      permittedCrossDomainPolicies: false,
      referrerPolicy: { policy: "no-referrer" },
      xssFilter: true,
    };
  }
  static generateRateLimitConfig() {
    const isProduction = process.env.NODE_ENV === "production";
    return {
      windowMs: 15 * 60 * 1000, 
      max: isProduction ? 100 : 1000, 
      message: {
        error: "Too many requests from this IP, please try again later.",
        retryAfter: "15 minutes",
      },
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => {
        return req.path === "/health" || req.path === "/ready";
      },
    };
  }
  static generateSpeedLimitConfig() {
    const isProduction = process.env.NODE_ENV === "production";
    return {
      windowMs: 15 * 60 * 1000, 
      delayAfter: isProduction ? 30 : 50, 
      delayMs: () => 500, 
      maxDelayMs: isProduction ? 30000 : 20000, 
      skip: (req) => {
        return req.path === "/health" || req.path === "/ready";
      },
      validate: {
        delayMs: false, 
      },
    };
  }
  static isOriginAllowed(origin, allowedOrigins) {
    if (!origin) return true; 
    return allowedOrigins.includes(origin);
  }
  static generateSessionConfig() {
    const isProduction = process.env.NODE_ENV === "production";
    return {
      secret: process.env.SESSION_SECRET || this.generateJWTSecret(32),
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: isProduction, 
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, 
        sameSite: isProduction ? "strict" : "lax",
      },
    };
  }
}
module.exports = SecurityUtils;
