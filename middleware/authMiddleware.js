// /api/middleware/auth.middleware.js
const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const { loadExistingSessions } = require('../auth/session')
const BlacklistedToken = require('../models/blacklistedTokenModel')
const { AppError } = require('./errorHandler')
const logger = require('../utils/logger')

const verifyToken = async (req, res, next) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn({
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        authHeader: authHeader ? 'malformed' : 'missing'
      }, 'Invalid authorization header');
      return next(new AppError('Invalid authorization header format', 401));
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return next(new AppError('No token provided', 401));
    }

    // Validate token format (basic check)
    if (token.length < 10 || !token.includes('.')) {
      logger.warn({
        ip: req.ip,
        tokenLength: token.length
      }, 'Invalid token format');
      return next(new AppError('Invalid token format', 401));
    }

    // Check if token is blacklisted
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const blacklisted = await BlacklistedToken.findOne({ 
      where: { token: tokenHash } 
    });
    
    if (blacklisted) {
      logger.warn({
        ip: req.ip,
        userAgent: req.get('User-Agent')
      }, 'Blacklisted token used');
      return next(new AppError('Token has been blacklisted', 401));
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256'], // Explicitly specify algorithm
      maxAge: '24h' // Maximum token age
    });

    // Additional security checks
    if (!decoded.id || !decoded.username) {
      logger.warn({
        ip: req.ip,
        decodedKeys: Object.keys(decoded)
      }, 'Token missing required claims');
      return next(new AppError('Invalid token claims', 401));
    }

    // Check token age (additional security)
    const tokenAge = Date.now() / 1000 - decoded.iat;
    if (tokenAge > 24 * 60 * 60) { // 24 hours
      logger.warn({
        ip: req.ip,
        tokenAge: Math.floor(tokenAge / 3600) + 'h'
      }, 'Token too old');
      return next(new AppError('Token expired', 401));
    }

    // Add security context to request
    req.user = decoded;
    req.tokenHash = tokenHash;
    req.securityContext = {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      tokenIssued: new Date(decoded.iat * 1000),
      tokenExpires: new Date(decoded.exp * 1000)
    };

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      try {
        const decoded = jwt.decode(token, { complete: true });
        if (decoded && decoded.payload) {
          // Hash token before storing in blacklist
          const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
          await BlacklistedToken.create({
            token: tokenHash,
            expiresAt: new Date(decoded.payload.exp * 1000),
          });
          
          logger.info({
            userId: decoded.payload.id,
            ip: req.ip
          }, 'Expired token blacklisted');
        }
        return res.status(401).json({ 
          status: 'error',
          message: 'Token expired',
          code: 'TOKEN_EXPIRED'
        });
      } catch (decodeErr) {
        logger.error('Error decoding expired token:', decodeErr);
        return next(new AppError('Token expired and invalid format', 400));
      }
    }
    
    if (err.name === 'JsonWebTokenError') {
      logger.warn({
        ip: req.ip,
        error: err.message
      }, 'JWT verification failed');
      return next(new AppError('Invalid token', 401));
    }

    logger.error('Token verification error:', err);
    next(new AppError('Token verification failed', 401));
  }
}

module.exports = { verifyToken }
