# File Cleanup Management

## Overview
The WhatsApp Blast API includes an automated file cleanup system to manage temporary files, old uploads, logs, and session data. This prevents disk space issues and maintains optimal performance.

## Features

### Automatic Cleanup
- **Scheduled Cleanup**: Runs every hour by default
- **Multiple File Types**: Handles uploads, logs, sessions, and temp files
- **Age-based Deletion**: Configurable retention periods
- **Safe Deletion**: Respects file locks and safety limits
- **Comprehensive Logging**: Detailed cleanup reports

### Manual Cleanup
- **On-demand Execution**: Trigger cleanup via API
- **Dry Run Mode**: Preview what would be deleted
- **Selective Cleanup**: Target specific directories
- **Custom Age Limits**: Override default retention periods

## Configuration

### Default Settings
```javascript
const fileCleanup = new FileCleanupManager({
  tempFileMaxAge: 24 * 60 * 60 * 1000,      // 24 hours
  logFileMaxAge: 7 * 24 * 60 * 60 * 1000,   // 7 days
  sessionFileMaxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  cleanupInterval: 60 * 60 * 1000,           // 1 hour
  maxFilesToDelete: 100,                     // Safety limit
  dryRun: false                              // Actually delete files
});
```

### Environment Variables
```env
# File cleanup configuration (optional)
CLEANUP_TEMP_MAX_AGE=86400000        # 24 hours in milliseconds
CLEANUP_LOG_MAX_AGE=604800000        # 7 days in milliseconds
CLEANUP_SESSION_MAX_AGE=2592000000   # 30 days in milliseconds
CLEANUP_INTERVAL=3600000             # 1 hour in milliseconds
CLEANUP_MAX_FILES=100                # Maximum files to delete per run
CLEANUP_DRY_RUN=false                # Set to true for dry run mode
```

## Directories Managed

### 1. Uploads Directory (`./uploads`)
**Purpose**: Excel files uploaded for blast campaigns
**Cleanup Rules**:
- Excel files (`.xlsx`, `.xls`, `.csv`) older than 24 hours
- Temporary files (`.tmp`, `.temp`) immediately
- Orphaned files with hash-like names older than 1 hour

**File Patterns**:
```javascript
uploadFiles: /\.(xlsx|xls|csv)$/i
tempFiles: /\.(tmp|temp)$/i
orphanedFiles: /^[a-f0-9]{32,40}$/  // Hash-like filenames
```

### 2. Logs Directory (`./logs`)
**Purpose**: Application log files
**Cleanup Rules**:
- Log files (`.log`) older than 7 days
- Rotated logs and backup files

**File Patterns**:
```javascript
logFiles: /\.log$/i
backupFiles: /\.bak$/i
```

### 3. Sessions Directory (`./sessions`)
**Purpose**: WhatsApp session data
**Cleanup Rules**:
- Session directories older than 30 days
- Individual session files older than 30 days
- Corrupted or incomplete session data

### 4. Temp Directory (`./temp`)
**Purpose**: Temporary processing files
**Cleanup Rules**:
- All files older than 24 hours
- No file type restrictions

## API Endpoints

### Get Cleanup Statistics
```http
GET /cleanup/stats
Authorization: Bearer <token>
```

**Response**:
```json
{
  "status": "success",
  "data": {
    "totalFiles": 156,
    "totalSize": 52428800,
    "formattedTotalSize": "50.00 MB",
    "directories": {
      "uploads": {
        "fileCount": 23,
        "totalSize": 15728640,
        "formattedSize": "15.00 MB",
        "oldestFileAge": 86400000,
        "newestFileAge": 3600000
      },
      "logs": {
        "fileCount": 7,
        "totalSize": 1048576,
        "formattedSize": "1.00 MB"
      }
    }
  },
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

### Run Manual Cleanup
```http
POST /cleanup/manual
Authorization: Bearer <token>
Content-Type: application/json

{
  "dryRun": true,
  "maxAge": 3600000,
  "directories": ["uploads", "temp"]
}
```

**Response**:
```json
{
  "status": "success",
  "data": {
    "totalFiles": 156,
    "deletedFiles": 23,
    "freedSpace": 15728640,
    "formattedFreedSpace": "15.00 MB",
    "errors": [],
    "dryRun": true
  },
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

### Get Cleanup Configuration
```http
GET /cleanup/config
Authorization: Bearer <token>
```

**Response**:
```json
{
  "status": "success",
  "data": {
    "tempFileMaxAge": 86400000,
    "logFileMaxAge": 604800000,
    "sessionFileMaxAge": 2592000000,
    "cleanupInterval": 3600000,
    "maxFilesToDelete": 100,
    "isRunning": false,
    "autoCleanupEnabled": true,
    "directories": {
      "uploads": "./uploads",
      "logs": "./logs",
      "sessions": "./sessions",
      "temp": "./temp"
    }
  }
}
```

### Update Cleanup Configuration
```http
PUT /cleanup/config
Authorization: Bearer <token>
Content-Type: application/json

{
  "tempFileMaxAge": 43200000,
  "logFileMaxAge": 1209600000,
  "maxFilesToDelete": 200
}
```

### Toggle Auto Cleanup
```http
POST /cleanup/toggle
Authorization: Bearer <token>
Content-Type: application/json

{
  "enabled": false
}
```

## Cleanup Process

### Automatic Cleanup Flow
1. **Startup**: Auto cleanup starts with application
2. **Scheduled Run**: Executes every hour (configurable)
3. **Directory Scan**: Checks all managed directories
4. **Age Evaluation**: Compares file age with retention policies
5. **Safe Deletion**: Respects safety limits and file locks
6. **Logging**: Records all cleanup activities
7. **Statistics**: Updates cleanup metrics

### Manual Cleanup Flow
1. **API Request**: User triggers manual cleanup
2. **Parameter Validation**: Validates request parameters
3. **Option Override**: Applies custom settings temporarily
4. **Execution**: Runs cleanup with specified options
5. **Results**: Returns detailed cleanup results
6. **Logging**: Records manual cleanup activity

## Safety Features

### File Protection
- **Safety Limits**: Maximum files deleted per run
- **File Lock Respect**: Skips files in use
- **Error Handling**: Continues on individual file errors
- **Dry Run Mode**: Preview mode for testing

### Logging & Monitoring
```javascript
// Cleanup completion log
logger.info({
  duration: '1234ms',
  totalFiles: 156,
  deletedFiles: 23,
  freedSpace: '15.00 MB',
  errors: 0
}, '✅ File cleanup completed');

// Individual file deletion
logger.debug('Deleted old upload file: /uploads/file.xlsx (2.5 MB)');

// Error handling
logger.error('Failed to delete /uploads/locked.xlsx: EBUSY');
```

### Error Recovery
- **Continue on Error**: Individual file failures don't stop cleanup
- **Error Collection**: All errors are collected and reported
- **Retry Logic**: Some operations include retry mechanisms
- **Graceful Degradation**: Partial cleanup is better than no cleanup

## Monitoring & Maintenance

### Health Monitoring
```javascript
// Check cleanup status
const stats = await fileCleanup.getCleanupStats();
console.log(`Total files: ${stats.totalFiles}`);
console.log(`Total size: ${fileCleanup.formatBytes(stats.totalSize)}`);
```

### Performance Metrics
- **Cleanup Duration**: Time taken for each cleanup run
- **Files Processed**: Number of files evaluated
- **Space Freed**: Amount of disk space recovered
- **Error Rate**: Percentage of failed deletions

### Alerting
```javascript
// Monitor for excessive file accumulation
if (stats.totalFiles > 1000) {
  logger.warn('High file count detected, consider reducing retention periods');
}

// Monitor for cleanup failures
if (results.errors.length > 10) {
  logger.error('High error rate in file cleanup, investigation needed');
}
```

## Best Practices

### Production Configuration
```javascript
const productionConfig = {
  tempFileMaxAge: 12 * 60 * 60 * 1000,      // 12 hours (more aggressive)
  logFileMaxAge: 3 * 24 * 60 * 60 * 1000,   // 3 days (shorter retention)
  sessionFileMaxAge: 7 * 24 * 60 * 60 * 1000, // 7 days (active cleanup)
  cleanupInterval: 30 * 60 * 1000,           // 30 minutes (more frequent)
  maxFilesToDelete: 500,                     // Higher limit for production
  dryRun: false
};
```

### Development Configuration
```javascript
const developmentConfig = {
  tempFileMaxAge: 24 * 60 * 60 * 1000,      // 24 hours (lenient)
  logFileMaxAge: 7 * 24 * 60 * 60 * 1000,   // 7 days (keep for debugging)
  sessionFileMaxAge: 30 * 24 * 60 * 60 * 1000, // 30 days (preserve sessions)
  cleanupInterval: 60 * 60 * 1000,           // 1 hour (less frequent)
  maxFilesToDelete: 50,                      // Lower limit for safety
  dryRun: true                               // Dry run by default
};
```

### Monitoring Setup
```javascript
// Set up cleanup monitoring
setInterval(async () => {
  const stats = await fileCleanup.getCleanupStats();
  
  // Alert if disk usage is high
  if (stats.totalSize > 100 * 1024 * 1024) { // 100MB
    logger.warn('High disk usage detected:', fileCleanup.formatBytes(stats.totalSize));
  }
  
  // Alert if too many files
  if (stats.totalFiles > 500) {
    logger.warn('High file count detected:', stats.totalFiles);
  }
}, 5 * 60 * 1000); // Check every 5 minutes
```

## Troubleshooting

### Common Issues

1. **Files Not Being Deleted**
   - Check file permissions
   - Verify file is not in use
   - Check safety limits
   - Review file age calculation

2. **High Error Rate**
   - Check disk space
   - Verify directory permissions
   - Review file lock status
   - Check system resources

3. **Cleanup Taking Too Long**
   - Reduce maxFilesToDelete
   - Increase cleanup interval
   - Check disk I/O performance
   - Review file system health

4. **Unexpected File Deletion**
   - Review retention policies
   - Check file patterns
   - Verify age calculations
   - Use dry run mode for testing

### Debug Mode
```javascript
// Enable debug logging
const fileCleanup = new FileCleanupManager({
  ...config,
  debug: true
});

// Manual cleanup with verbose logging
const results = await fileCleanup.manualCleanup({
  dryRun: true,
  verbose: true
});
```

### Recovery Procedures
```javascript
// Disable auto cleanup if issues occur
fileCleanup.stopAutoCleanup();

// Run diagnostic cleanup
const diagnostics = await fileCleanup.manualCleanup({
  dryRun: true,
  maxAge: 0 // Show all files
});

// Gradual cleanup recovery
await fileCleanup.manualCleanup({
  dryRun: false,
  maxAge: 7 * 24 * 60 * 60 * 1000, // Start with 7 days
  maxFilesToDelete: 10 // Small batches
});
```

This file cleanup system ensures optimal disk space usage while maintaining data integrity and providing comprehensive monitoring and control capabilities.