# Rate Limiting & Speed Limiting Configuration

## Overview
This application implements two layers of request limiting:
1. **Rate Limiting**: Hard limits on requests per time window
2. **Speed Limiting**: Progressive delays for repeated requests

## Express-Slow-Down v2 Compatibility

### Migration from v1 to v2
Express-slow-down v2 changed the `delayMs` option behavior. Our implementation is compatible with v2:

#### ✅ Current Implementation (v2 Compatible)
```javascript
const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000,
  delayAfter: 50,
  delayMs: () => 500, // Fixed delay function
  maxDelayMs: 20000,
  validate: {
    delayMs: false // Disable migration warning
  }
});
```

#### ❌ Old v1 Syntax (Deprecated)
```javascript
const speedLimiter = slowDown({
  delayMs: 500 // This causes the warning
});
```

## Rate Limiting Configuration

### Basic Rate Limiting
```javascript
const rateLimitConfig = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window (production)
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true, // Include rate limit info in headers
  legacyHeaders: false, // Disable legacy X-RateLimit-* headers
  skip: (req) => req.path === '/health' || req.path === '/ready'
};
```

### Environment-Based Configuration
```javascript
// Development: More lenient
max: 1000 // requests per 15 minutes

// Production: Stricter
max: 100 // requests per 15 minutes
```

## Speed Limiting Configuration

### Fixed Delay (Recommended)
```javascript
const speedLimitConfig = {
  windowMs: 15 * 60 * 1000,
  delayAfter: 50, // Start delaying after 50 requests
  delayMs: () => 500, // Fixed 500ms delay
  maxDelayMs: 20000, // Maximum 20 second delay
  validate: { delayMs: false }
};
```

### Progressive Delay (Alternative)
```javascript
const speedLimitConfig = {
  windowMs: 15 * 60 * 1000,
  delayAfter: 30,
  delayMs: (used, req) => {
    const delayAfter = req.slowDown.limit;
    return Math.min((used - delayAfter) * 500, 30000);
  },
  validate: { delayMs: false }
};
```

## Response Headers

### Rate Limit Headers
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
Retry-After: 900
```

### Speed Limit Behavior
- Requests 1-50: No delay
- Request 51: 500ms delay
- Request 52: 500ms delay
- ...continues until maxDelayMs

## Configuration Methods

### Using SecurityUtils
```javascript
const SecurityUtils = require('./utils/security');

// Rate limiting
const rateLimitConfig = SecurityUtils.generateRateLimitConfig();
const limiter = rateLimit(rateLimitConfig);

// Speed limiting
const speedLimitConfig = SecurityUtils.generateSpeedLimitConfig();
const speedLimiter = slowDown(speedLimitConfig);
```

### Custom Configuration
```javascript
// Custom rate limiting for specific routes
const apiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 50, // 50 requests per 5 minutes
  message: 'API rate limit exceeded'
});

app.use('/api/auth', apiLimiter);
```

## Skip Conditions

### Health Check Exclusions
```javascript
skip: (req) => {
  // Skip rate limiting for health checks
  return req.path === '/health' || req.path === '/ready';
}
```

### User-Based Exclusions
```javascript
skip: (req) => {
  // Skip for admin users
  return req.user && req.user.role === 'admin';
}
```

### IP Whitelist
```javascript
skip: (req) => {
  const whitelistedIPs = ['127.0.0.1', '::1'];
  return whitelistedIPs.includes(req.ip);
}
```

## Error Handling

### Rate Limit Exceeded Response
```json
{
  "error": "Too many requests from this IP, please try again later.",
  "retryAfter": "15 minutes",
  "limit": 100,
  "remaining": 0,
  "resetTime": "2024-01-01T12:00:00.000Z"
}
```

### Speed Limit Behavior
- No error response
- Requests are delayed, not blocked
- Progressive delays up to maxDelayMs

## Monitoring & Logging

### Rate Limit Events
```javascript
// Log rate limit violations
limiter.onLimitReached = (req, res, options) => {
  logger.warn({
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    path: req.path,
    limit: options.max
  }, 'Rate limit exceeded');
};
```

### Speed Limit Monitoring
```javascript
// Monitor speed limit delays
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const delay = Date.now() - start;
    if (delay > 1000) {
      logger.info({
        ip: req.ip,
        path: req.path,
        delay: `${delay}ms`
      }, 'Request delayed by speed limiter');
    }
  });
  next();
});
```

## Testing Rate Limits

### Bash Testing Script
```bash
#!/bin/bash
echo "Testing rate limits..."

for i in {1..110}; do
  response=$(curl -s -w "%{http_code}" -o /dev/null http://localhost:3000/health)
  echo "Request $i: HTTP $response"
  
  if [ "$response" = "429" ]; then
    echo "Rate limit reached at request $i"
    break
  fi
done
```

### Node.js Testing
```javascript
const axios = require('axios');

async function testRateLimit() {
  for (let i = 1; i <= 110; i++) {
    try {
      const start = Date.now();
      await axios.get('http://localhost:3000/health');
      const delay = Date.now() - start;
      
      console.log(`Request ${i}: ${delay}ms`);
      
      if (delay > 1000) {
        console.log(`Speed limit active at request ${i}`);
      }
    } catch (error) {
      if (error.response?.status === 429) {
        console.log(`Rate limit reached at request ${i}`);
        break;
      }
    }
  }
}

testRateLimit();
```

## Production Recommendations

### Rate Limiting
- **API Endpoints**: 100 requests/15 minutes
- **Authentication**: 5 attempts/15 minutes
- **File Upload**: 10 uploads/hour
- **Health Checks**: Unlimited

### Speed Limiting
- **Delay After**: 30 requests (production), 50 (development)
- **Delay Amount**: 500ms fixed delay
- **Maximum Delay**: 30 seconds (production), 20 seconds (development)

### Monitoring
- Log all rate limit violations
- Monitor delay patterns
- Alert on sustained high traffic
- Track per-IP request patterns

## Troubleshooting

### Common Issues

1. **Warning: delayMs option changed**
   - **Solution**: Use `delayMs: () => 500` syntax
   - **Alternative**: Set `validate: { delayMs: false }`

2. **Rate limits too strict**
   - **Solution**: Adjust `max` value in configuration
   - **Check**: Environment-specific settings

3. **Health checks being limited**
   - **Solution**: Add skip condition for health endpoints
   - **Verify**: Skip function is working correctly

4. **Speed limits causing timeouts**
   - **Solution**: Reduce `maxDelayMs` value
   - **Alternative**: Increase `delayAfter` threshold

### Debug Configuration
```javascript
// Enable debug logging
const limiter = rateLimit({
  ...rateLimitConfig,
  onLimitReached: (req) => console.log('Rate limit hit:', req.ip),
  onHit: (req) => console.log('Request counted:', req.ip)
});
```

This configuration provides robust protection against abuse while maintaining good user experience for legitimate users.