# Security Implementation Guide

## Overview
This application implements comprehensive security measures including JWT security, CORS protection, input validation, rate limiting, and security headers.

## Security Features Implemented

### 1. JWT Security Enhancements

#### **Strong JWT Secret Validation**
- ✅ Minimum 32 characters (64+ recommended for production)
- ✅ Character diversity validation
- ✅ Weak pattern detection
- ✅ Entropy checking

#### **Enhanced JWT Generation**
```javascript
const tokenPayload = {
  id: user.id,
  username: user.username,
  role: user.role,
  iat: Math.floor(Date.now() / 1000),
  jti: crypto.randomBytes(16).toString('hex'), // JWT ID
  iss: 'whatsapp-blast-api', // Issuer
  aud: 'whatsapp-blast-client' // Audience
};
```

#### **Secure Token Verification**
- ✅ Algorithm specification (HS256)
- ✅ Token format validation
- ✅ Claims validation
- ✅ Token age checking
- ✅ Blacklist checking with hashed tokens

#### **Token Blacklisting Security**
- ✅ Tokens are hashed (SHA-256) before storage
- ✅ Automatic blacklisting on logout
- ✅ Expired token handling
- ✅ Security logging

### 2. CORS Security

#### **Dynamic CORS Configuration**
```javascript
// Environment-based origins
ALLOWED_ORIGINS=http://localhost:8080,https://yourdomain.com

// Automatic validation
const corsConfig = SecurityUtils.generateCORSConfig(allowedOrigins);
```

#### **CORS Validation Features**
- ✅ Wildcard detection in production
- ✅ Localhost warning in production
- ✅ HTTP protocol warning in production
- ✅ URL format validation
- ✅ Origin logging and blocking

#### **Enhanced CORS Options**
- ✅ Credentials support
- ✅ Method restrictions
- ✅ Header whitelisting
- ✅ Preflight caching
- ✅ Request origin validation

### 3. Security Headers (Helmet)

#### **Content Security Policy**
```javascript
contentSecurityPolicy: {
  directives: {
    defaultSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    scriptSrc: ["'self'"],
    imgSrc: ["'self'", "data:", "https:"],
    objectSrc: ["'none'"],
    frameSrc: ["'none'"]
  }
}
```

#### **Additional Security Headers**
- ✅ HSTS (HTTP Strict Transport Security)
- ✅ X-Frame-Options (Clickjacking protection)
- ✅ X-Content-Type-Options (MIME sniffing protection)
- ✅ X-XSS-Protection
- ✅ Referrer-Policy
- ✅ Cross-Origin policies

### 4. Rate Limiting & DDoS Protection

#### **Request Rate Limiting**
```javascript
windowMs: 15 * 60 * 1000, // 15 minutes
max: production ? 100 : 1000, // Requests per window
```

#### **Speed Limiting (Express-Slow-Down v2 Compatible)**
```javascript
delayAfter: 50, // Start delaying after 50 requests
delayMs: () => 500, // Fixed 500ms delay (v2 syntax)
maxDelayMs: 20000, // Maximum 20 second delay
validate: { delayMs: false } // Disable v2 migration warning
```

#### **Smart Skipping**
- ✅ Health check endpoints excluded
- ✅ Different limits for production/development
- ✅ IP-based tracking
- ✅ Detailed error messages

### 5. Input Validation & Sanitization

#### **XSS Protection**
```javascript
// Removes dangerous patterns
.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
.replace(/javascript:/gi, '')
.replace(/on\w+\s*=/gi, '');
```

#### **Content Type Validation**
- ✅ Allowed content types: JSON, form-data, URL-encoded
- ✅ Method-specific validation
- ✅ Request size limits
- ✅ Malformed request detection

#### **Request Size Limits**
- ✅ Configurable size limits (default: 10MB)
- ✅ Content-Length validation
- ✅ Body parser limits
- ✅ File upload restrictions

### 6. Security Logging & Monitoring

#### **Comprehensive Request Logging**
```javascript
logger.info({
  method: req.method,
  url: req.url,
  ip: req.ip,
  userAgent: req.get('User-Agent'),
  origin: req.get('Origin'),
  duration: `${duration}ms`
}, 'Request completed');
```

#### **Security Event Logging**
- ✅ Failed authentication attempts
- ✅ Blocked CORS requests
- ✅ Rate limit violations
- ✅ Invalid token usage
- ✅ Suspicious request patterns

### 7. Environment Security Validation

#### **JWT Secret Strength**
```bash
# Generate secure JWT secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

#### **Production Security Checks**
- ✅ JWT secret length validation
- ✅ Weak password detection
- ✅ Secret reuse prevention
- ✅ HTTPS enforcement warnings

## Security Configuration

### Environment Variables
```env
# Strong JWT secret (64+ characters)
JWT_SECRET=d7d168f7ebf34c48cb1379da1c014b784e8f1c20b5e0d5b585038e9c7ed84946

# JWT expiration
JWT_EXPIRES_IN=12h

# CORS origins (comma-separated)
ALLOWED_ORIGINS=https://yourdomain.com,https://app.yourdomain.com

# Optional API keys
API_KEYS=api_key_1,api_key_2

# Session secret (different from JWT)
SESSION_SECRET=different_session_secret_key
```

### Production Checklist

#### **Before Deployment**
- [ ] Generate strong JWT secret (64+ characters)
- [ ] Configure production CORS origins
- [ ] Set NODE_ENV=production
- [ ] Enable HTTPS
- [ ] Configure proper database credentials
- [ ] Set up monitoring and logging
- [ ] Configure rate limiting
- [ ] Test security headers

#### **Security Headers Verification**
```bash
# Test security headers
curl -I https://yourdomain.com/health

# Expected headers:
# Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
# X-Frame-Options: DENY
# X-Content-Type-Options: nosniff
# X-XSS-Protection: 1; mode=block
# Referrer-Policy: no-referrer
```

## Security Testing

### JWT Security Test
```javascript
const SecurityUtils = require('./utils/security');

// Test JWT secret strength
const result = SecurityUtils.validateJWTSecret(process.env.JWT_SECRET);
console.log('JWT Security Score:', result.score, '/4');
```

### CORS Testing
```javascript
// Test CORS configuration
const corsValidation = SecurityUtils.validateCORSOrigins(allowedOrigins);
console.log('CORS Validation:', corsValidation);
```

### Rate Limiting Test
```bash
# Test rate limiting
for i in {1..110}; do
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/health
done
```

## Security Monitoring

### Health Check Security
```json
GET /health
{
  "status": "OK",
  "security": {
    "corsEnabled": true,
    "rateLimitEnabled": true,
    "helmetEnabled": true,
    "jwtValidation": "strong"
  }
}
```

### Security Logs
```javascript
// Authentication events
[INFO] User logged in successfully { userId: 1, ip: "192.168.1.1" }
[WARN] Invalid token attempt { ip: "192.168.1.100", error: "malformed" }
[WARN] CORS blocked origin { origin: "http://malicious.com", ip: "1.2.3.4" }
[WARN] Rate limit exceeded { ip: "1.2.3.4", endpoint: "/api/login" }
```

## Common Security Issues & Solutions

### 1. Weak JWT Secret
**Problem**: Short or predictable JWT secret
**Solution**: Use `SecurityUtils.generateJWTSecret(64)`

### 2. CORS Misconfiguration
**Problem**: Wildcard origins in production
**Solution**: Specify exact origins in ALLOWED_ORIGINS

### 3. Missing Security Headers
**Problem**: Vulnerable to XSS, clickjacking
**Solution**: Helmet middleware automatically applied

### 4. Rate Limiting Bypass
**Problem**: DDoS attacks
**Solution**: Multiple layers (rate + speed limiting)

### 5. Token Leakage
**Problem**: Tokens in logs or storage
**Solution**: Token hashing before blacklist storage

## Security Updates

### Regular Maintenance
- [ ] Update dependencies monthly
- [ ] Review security logs weekly
- [ ] Rotate JWT secrets quarterly
- [ ] Update CORS origins as needed
- [ ] Monitor rate limiting effectiveness

### Security Auditing
```bash
# Check for vulnerabilities
npm audit

# Fix automatically
npm audit fix

# Manual review required
npm audit --audit-level high
```

This comprehensive security implementation provides enterprise-grade protection for the WhatsApp Blast API application.