const crypto = require('crypto');
const logger = require('./logger');

/**
 * Security utility functions
 */
class SecurityUtils {
  /**
   * Generate a cryptographically secure JWT secret
   * @param {number} length - Length of the secret in bytes (default: 64)
   * @returns {string} - Hex encoded secret
   */
  static generateJWTSecret(length = 64) {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Validate JWT secret strength
   * @param {string} secret - JWT secret to validate
   * @returns {Object} - Validation result
   */
  static validateJWTSecret(secret) {
    const result = {
      valid: true,
      score: 0,
      issues: [],
      recommendations: []
    };

    // Check minimum length
    if (secret.length < 32) {
      result.valid = false;
      result.issues.push('JWT secret is too short (minimum 32 characters)');
      result.recommendations.push('Use at least 32 characters for development, 64+ for production');
    } else if (secret.length < 64) {
      result.score += 1;
      result.recommendations.push('Consider using 64+ characters for better security');
    } else {
      result.score += 2;
    }

    // Check for common weak patterns
    const weakPatterns = [
      /^(password|secret|key|token)/i,
      /^(123|abc|test|demo)/i,
      /^(.)\1{10,}/,  // Repeated characters
      /^(qwerty|asdf|zxcv)/i
    ];

    weakPatterns.forEach(pattern => {
      if (pattern.test(secret)) {
        result.valid = false;
        result.issues.push('JWT secret contains weak patterns');
        result.recommendations.push('Use a cryptographically secure random string');
      }
    });

    // Check entropy (simplified)
    const uniqueChars = new Set(secret.toLowerCase()).size;
    if (uniqueChars < 10) {
      result.issues.push('JWT secret has low character diversity');
      result.recommendations.push('Use a mix of letters, numbers, and symbols');
    } else {
      result.score += 1;
    }

    // Check for hex format (good practice)
    if (/^[a-f0-9]+$/i.test(secret)) {
      result.score += 1;
    }

    return result;
  }

  /**
   * Validate CORS origins
   * @param {Array} origins - Array of origin URLs
   * @returns {Object} - Validation result
   */
  static validateCORSOrigins(origins) {
    const result = {
      valid: true,
      issues: [],
      recommendations: []
    };

    origins.forEach((origin, index) => {
      // Check for wildcard in production
      if (origin === '*') {
        result.issues.push('Wildcard CORS origin (*) is not secure for production');
        result.recommendations.push('Specify exact origins instead of using wildcard');
      }

      // Check for localhost in production
      if (process.env.NODE_ENV === 'production' && origin.includes('localhost')) {
        result.issues.push(`Localhost origin found in production: ${origin}`);
        result.recommendations.push('Remove localhost origins in production');
      }

      // Check for HTTP in production
      if (process.env.NODE_ENV === 'production' && origin.startsWith('http://') && !origin.includes('localhost')) {
        result.issues.push(`Insecure HTTP origin in production: ${origin}`);
        result.recommendations.push('Use HTTPS origins in production');
      }

      // Validate URL format
      try {
        new URL(origin);
      } catch (error) {
        result.valid = false;
        result.issues.push(`Invalid origin URL format: ${origin}`);
      }
    });

    return result;
  }

  /**
   * Generate secure CORS configuration
   * @param {Array} allowedOrigins - Array of allowed origins
   * @param {Object} options - Additional CORS options
   * @returns {Object} - CORS configuration
   */
  static generateCORSConfig(allowedOrigins = [], options = {}) {
    const isProduction = process.env.NODE_ENV === 'production';
    
    // Validate origins
    const validation = this.validateCORSOrigins(allowedOrigins);
    if (!validation.valid) {
      logger.error('CORS configuration validation failed:', validation.issues);
      throw new Error('Invalid CORS origins configuration');
    }

    // Log warnings
    validation.issues.forEach(issue => logger.warn(`CORS Warning: ${issue}`));
    validation.recommendations.forEach(rec => logger.info(`CORS Recommendation: ${rec}`));

    const corsConfig = {
      origin: function (origin, callback) {
        // Allow requests with no origin (mobile apps, etc.)
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
      methods: options.methods || ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: options.allowedHeaders || [
        'Origin',
        'X-Requested-With',
        'Content-Type',
        'Accept',
        'Authorization'
      ],
      exposedHeaders: options.exposedHeaders || ['X-Total-Count'],
      maxAge: isProduction ? 86400 : 300, // 24 hours in production, 5 minutes in dev
      preflightContinue: false,
      optionsSuccessStatus: 204
    };

    return corsConfig;
  }

  /**
   * Generate security headers configuration
   * @returns {Object} - Security headers
   */
  static generateSecurityHeaders() {
    const isProduction = process.env.NODE_ENV === 'production';
    
    return {
      // Content Security Policy
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
          frameSrc: ["'none'"]
        }
      },
      
      // Other security headers
      crossOriginEmbedderPolicy: false, // Disable if causing issues
      crossOriginOpenerPolicy: { policy: "same-origin" },
      crossOriginResourcePolicy: { policy: "cross-origin" },
      dnsPrefetchControl: { allow: false },
      frameguard: { action: 'deny' },
      hidePoweredBy: true,
      hsts: isProduction ? {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      } : false,
      ieNoOpen: true,
      noSniff: true,
      originAgentCluster: true,
      permittedCrossDomainPolicies: false,
      referrerPolicy: { policy: "no-referrer" },
      xssFilter: true
    };
  }

  /**
   * Rate limiting configuration
   * @returns {Object} - Rate limit config
   */
  static generateRateLimitConfig() {
    const isProduction = process.env.NODE_ENV === 'production';
    
    return {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: isProduction ? 100 : 1000, // Stricter in production
      message: {
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: '15 minutes'
      },
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => {
        // Skip rate limiting for health checks
        return req.path === '/health' || req.path === '/ready';
      }
    };
  }

  /**
   * Speed limiting configuration (compatible with express-slow-down v2)
   * @returns {Object} - Speed limit config
   */
  static generateSpeedLimitConfig() {
    const isProduction = process.env.NODE_ENV === 'production';
    
    return {
      windowMs: 15 * 60 * 1000, // 15 minutes
      delayAfter: isProduction ? 30 : 50, // Start delaying after N requests
      delayMs: () => 500, // Fixed delay of 500ms per request (v2 syntax)
      maxDelayMs: isProduction ? 30000 : 20000, // Maximum delay
      skip: (req) => {
        // Skip speed limiting for health checks
        return req.path === '/health' || req.path === '/ready';
      },
      validate: {
        delayMs: false // Disable the v2 migration warning
      },
      // Optional: Custom delay function for progressive delays
      // delayMs: (used, req) => {
      //   const delayAfter = req.slowDown.limit;
      //   return Math.min((used - delayAfter) * 500, 30000);
      // }
    };
  }

  /**
   * Validate request origin against allowed origins
   * @param {string} origin - Request origin
   * @param {Array} allowedOrigins - Array of allowed origins
   * @returns {boolean} - Whether origin is allowed
   */
  static isOriginAllowed(origin, allowedOrigins) {
    if (!origin) return true; // Allow requests with no origin
    return allowedOrigins.includes(origin);
  }

  /**
   * Generate a secure session configuration
   * @returns {Object} - Session configuration
   */
  static generateSessionConfig() {
    const isProduction = process.env.NODE_ENV === 'production';
    
    return {
      secret: process.env.SESSION_SECRET || this.generateJWTSecret(32),
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: isProduction, // HTTPS only in production
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: isProduction ? 'strict' : 'lax'
      }
    };
  }
}

module.exports = SecurityUtils;