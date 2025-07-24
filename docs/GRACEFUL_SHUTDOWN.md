# Graceful Shutdown Implementation

## Overview
The WhatsApp Blast API implements comprehensive graceful shutdown handling to ensure data integrity, proper resource cleanup, and minimal service disruption during application termination.

## Features

### Enhanced Shutdown Management
- **Priority-based Handlers**: Shutdown tasks executed in priority order
- **Connection Tracking**: Monitor and gracefully close active connections
- **Request Rejection**: Reject new requests during shutdown
- **Timeout Protection**: Force shutdown if graceful shutdown takes too long
- **Comprehensive Logging**: Detailed shutdown process logging

### Signal Handling
- **SIGTERM**: Graceful shutdown (production deployments)
- **SIGINT**: Graceful shutdown (Ctrl+C in development)
- **SIGKILL**: Immediate termination (handled by OS)
- **Uncaught Exceptions**: Graceful shutdown on unhandled errors
- **Unhandled Rejections**: Graceful shutdown on promise rejections

## Shutdown Process

### Priority-based Execution
```javascript
Priority 10: Stop HTTP Server (no new connections)
Priority 20: Close Socket.IO connections
Priority 30: Stop file cleanup manager
Priority 40: Stop database health checks
Priority 50: Close database connections
Priority 60: Final cleanup tasks
```

### Shutdown Flow
1. **Signal Received**: SIGTERM, SIGINT, or error condition
2. **Reject New Requests**: Return 503 Service Unavailable
3. **Execute Handlers**: Run shutdown handlers by priority
4. **Wait for Connections**: Allow active requests to complete
5. **Force Shutdown**: Terminate if timeout exceeded
6. **Process Exit**: Clean application termination

## Configuration

### Shutdown Timeout
```javascript
const shutdownManager = new GracefulShutdownManager();
shutdownManager.setShutdownTimeout(30000); // 30 seconds
```

### Environment Variables
```env
# Graceful shutdown configuration
SHUTDOWN_TIMEOUT=30000          # Shutdown timeout in milliseconds
SHUTDOWN_FORCE_TIMEOUT=5000     # Force shutdown timeout
SHUTDOWN_CONNECTION_TIMEOUT=5000 # Connection close timeout
```

## Shutdown Handlers

### HTTP Server Handler
```javascript
shutdownManager.registerHandler('http-server', async () => {
  return new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}, 10); // Priority 10
```

### Database Handler
```javascript
shutdownManager.registerHandler('database', async () => {
  await sequelize.close();
  logger.info("🗄️ Database connection closed");
}, 50); // Priority 50
```

### Custom Handler Registration
```javascript
// Register custom shutdown handler
shutdownManager.registerHandler('my-service', async () => {
  await myService.cleanup();
  logger.info("🔧 My service cleaned up");
}, 25); // Priority 25 (between server and database)
```

## Middleware Integration

### Shutdown Status Middleware
```javascript
app.use(shutdownMiddleware(shutdownManager));
```
- Rejects requests during shutdown with 503 status
- Adds shutdown status headers
- Provides retry-after suggestions

### Request Tracking Middleware
```javascript
app.use(requestTrackingMiddleware(shutdownManager));
```
- Tracks active requests during shutdown
- Monitors request completion
- Provides request statistics

### Shutdown Headers Middleware
```javascript
app.use(shutdownHeadersMiddleware(shutdownManager));
```
- Adds process information headers
- Includes shutdown timing information
- Provides uptime and memory usage

## API Endpoints

### Shutdown Status
```http
GET /shutdown/status
```

**Response**:
```json
{
  "status": "success",
  "data": {
    "status": "healthy",
    "stats": {
      "isShuttingDown": false,
      "activeConnections": 5,
      "registeredHandlers": 6,
      "shutdownTimeout": 30000,
      "shutdownDuration": null
    },
    "handlers": [
      {
        "name": "http-server",
        "priority": 10,
        "executed": false
      },
      {
        "name": "database",
        "priority": 50,
        "executed": false
      }
    ]
  },
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

### During Shutdown
```json
{
  "status": "success",
  "data": {
    "status": "shutting_down",
    "stats": {
      "isShuttingDown": true,
      "activeConnections": 2,
      "shutdownDuration": 5000
    }
  }
}
```

## Response Headers

### Normal Operation
```
X-Shutdown-Status: healthy
X-Process-ID: 12345
X-Uptime: 3600
X-Memory-Usage: 128MB
```

### During Shutdown
```
X-Shutdown-Status: shutting-down
X-Shutdown-Remaining: 25
Connection: close
```

### Request Rejection (503 Response)
```json
{
  "status": "error",
  "message": "Service is shutting down",
  "code": "SERVICE_SHUTTING_DOWN",
  "retryAfter": 60
}
```

## Connection Management

### Connection Tracking
```javascript
// Track server connections
server.on('connection', (connection) => {
  shutdownManager.trackConnection(connection);
});

// Connections are automatically removed when closed
connection.on('close', () => {
  // Automatically handled by shutdown manager
});
```

### Active Connection Monitoring
```javascript
// Get active connection count
const stats = shutdownManager.getShutdownStats();
console.log(`Active connections: ${stats.activeConnections}`);
```

### Connection Timeout
```javascript
// Wait for connections to close gracefully
await shutdownManager.waitForConnectionsToClose(5000); // 5 second timeout
```

## Logging & Monitoring

### Shutdown Start
```javascript
logger.info({
  signal: 'SIGTERM',
  activeConnections: 5,
  registeredHandlers: 6
}, '🛑 Starting graceful shutdown');
```

### Handler Execution
```javascript
logger.info('🔄 Executing shutdown handler: http-server');
logger.info('✅ Shutdown handler completed: http-server (150ms)');
logger.error('❌ Shutdown handler failed: database (timeout)');
```

### Shutdown Completion
```javascript
logger.info({
  signal: 'SIGTERM',
  duration: '2500ms',
  handlersExecuted: 6,
  successfulHandlers: 5,
  failedHandlers: 1
}, '✅ Graceful shutdown completed');
```

### Force Shutdown
```javascript
logger.error({
  signal: 'SIGTERM',
  duration: '30000ms',
  reason: 'timeout'
}, '💥 Forced shutdown after timeout');
```

## Error Handling

### Handler Timeout
```javascript
// Individual handler timeout (10 seconds)
await Promise.race([
  handler.handler(),
  new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Handler timeout')), 10000)
  )
]);
```

### Shutdown Timeout
```javascript
// Overall shutdown timeout (30 seconds)
setTimeout(() => {
  logger.error("⏰ Forced shutdown after timeout");
  shutdownManager.forceShutdown();
}, shutdownTimeout);
```

### Connection Force Close
```javascript
// Force close connections during emergency shutdown
for (const connection of activeConnections) {
  if (connection.destroy) {
    connection.destroy();
  }
}
```

## Testing

### Manual Shutdown Test
```bash
# Send SIGTERM to test graceful shutdown
kill -TERM <process_id>

# Send SIGINT (Ctrl+C)
kill -INT <process_id>
```

### Shutdown Status Test
```bash
# Check shutdown status
curl http://localhost:3000/shutdown/status

# Test request rejection during shutdown
curl http://localhost:3000/health
# Should return 503 during shutdown
```

### Load Testing During Shutdown
```javascript
// Test script to verify graceful handling
const axios = require('axios');

async function testShutdownBehavior() {
  // Start multiple requests
  const requests = Array(10).fill().map(() => 
    axios.get('http://localhost:3000/health')
  );
  
  // Trigger shutdown after 1 second
  setTimeout(() => {
    process.kill(process.pid, 'SIGTERM');
  }, 1000);
  
  // Wait for all requests
  const results = await Promise.allSettled(requests);
  console.log('Request results:', results);
}
```

## Production Deployment

### Docker Integration
```dockerfile
# Dockerfile
FROM node:18-alpine

# Install app
COPY . /app
WORKDIR /app
RUN npm install

# Use exec form to ensure proper signal handling
CMD ["node", "index.js"]

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1
```

### Kubernetes Integration
```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
      - name: whatsapp-api
        image: whatsapp-api:latest
        lifecycle:
          preStop:
            exec:
              command: ["/bin/sh", "-c", "sleep 10"]
        terminationGracePeriodSeconds: 40
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 10
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 15
          periodSeconds: 20
```

### Process Manager Integration
```javascript
// PM2 ecosystem.config.js
module.exports = {
  apps: [{
    name: 'whatsapp-api',
    script: 'index.js',
    kill_timeout: 40000, // 40 seconds
    wait_ready: true,
    listen_timeout: 10000,
    shutdown_with_message: true
  }]
};
```

## Best Practices

### Handler Design
1. **Idempotent**: Handlers should be safe to run multiple times
2. **Fast**: Complete within reasonable time (< 10 seconds)
3. **Error Handling**: Handle errors gracefully
4. **Logging**: Provide clear status updates

### Connection Management
1. **Track Connections**: Monitor all active connections
2. **Graceful Close**: Allow requests to complete naturally
3. **Timeout Protection**: Force close if taking too long
4. **Resource Cleanup**: Ensure all resources are released

### Monitoring
1. **Health Checks**: Implement proper health check endpoints
2. **Metrics**: Track shutdown duration and success rate
3. **Alerting**: Alert on shutdown failures or timeouts
4. **Logging**: Comprehensive shutdown process logging

### Testing
1. **Unit Tests**: Test individual shutdown handlers
2. **Integration Tests**: Test complete shutdown process
3. **Load Tests**: Test shutdown under load
4. **Chaos Testing**: Test unexpected shutdown scenarios

This graceful shutdown implementation ensures reliable, predictable application termination with minimal service disruption and complete resource cleanup.