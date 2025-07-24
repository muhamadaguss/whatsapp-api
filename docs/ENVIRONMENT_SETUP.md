# Environment Setup Guide

## Overview
This application uses environment variables for configuration. All required variables must be set before starting the application.

## Environment Validation
The application automatically validates environment variables on startup and will exit with an error if any required variables are missing or invalid.

## Required Environment Variables

### Database Configuration
- **DB_NAME**: Database name (e.g., `whatsapp_blast`)
- **DB_USER**: Database username (e.g., `postgres`)
- **DB_PASS**: Database password (should be secure)
- **DB_HOST**: Database host (e.g., `localhost` or `192.168.1.100`)
- **JWT_SECRET**: JWT secret key for token signing (minimum 32 characters, recommended 64+)

### Optional Environment Variables
- **PORT**: Server port (default: `3000`)
- **DB_PORT**: Database port (default: `5432`)
- **NODE_ENV**: Environment mode (`development`, `production`, `test`) (default: `development`)

## Setup Instructions

### 1. Copy Environment Template
```bash
cp .env.example .env
```

### 2. Edit Environment Variables
```bash
nano .env
```

### 3. Required Configuration
```env
DB_NAME=whatsapp_blast
DB_USER=postgres
DB_PASS=your_secure_password_here
DB_HOST=localhost
DB_PORT=5432
JWT_SECRET=your_very_long_and_secure_jwt_secret_key_at_least_64_characters_long
PORT=3000
NODE_ENV=development
```

## Security Recommendations

### Development Environment
- Use strong passwords even in development
- Keep JWT_SECRET unique and secure
- Don't commit .env files to version control

### Production Environment
- Use environment-specific secrets
- JWT_SECRET should be at least 64 characters
- Use secure database passwords
- Set NODE_ENV to `production`
- Consider using environment variable management tools

## Validation Features

### Startup Validation
- ✅ Checks all required variables are present
- ✅ Validates variable formats (ports, etc.)
- ✅ Warns about security issues
- ✅ Provides helpful error messages

### Runtime Health Checks
- ✅ Database connection monitoring
- ✅ Health check endpoints (`/health`, `/ready`)
- ✅ Graceful shutdown handling
- ✅ Process signal handling

## Health Check Endpoints

### `/health`
Returns detailed application health status:
```json
{
  "status": "OK",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "environment": "development",
  "version": "1.0.0",
  "uptime": 123.456,
  "memory": {...},
  "database": {
    "healthy": true,
    "timestamp": "2024-01-01T00:00:00.000Z"
  },
  "pid": 12345
}
```

### `/ready`
Returns readiness status for load balancers:
```json
{
  "status": "READY",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Error Messages

### Missing Required Variables
```
Environment validation failed:
  - Missing required environment variable: DB_NAME (Database name)
  - Missing required environment variable: JWT_SECRET (JWT secret key for token signing)
```

### Invalid Formats
```
Environment format validation failed:
  - PORT must be a valid number
  - NODE_ENV must be one of: development, production, test
```

### Security Warnings
```
Security warnings for production:
  - JWT_SECRET should be at least 64 characters in production
  - Database password appears to be weak
```

## Troubleshooting

### Common Issues

1. **Missing .env file**
   - Copy `.env.example` to `.env`
   - Fill in all required variables

2. **Database connection failed**
   - Check database is running
   - Verify connection details
   - Check network connectivity

3. **JWT_SECRET too short**
   - Generate a longer secret key
   - Use at least 32 characters (64+ recommended)

4. **Port already in use**
   - Change PORT in .env file
   - Kill process using the port

### Environment Variable Generation

#### Generate JWT Secret
```bash
# Using Node.js
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Using OpenSSL
openssl rand -hex 64
```

#### Generate Secure Password
```bash
# Using OpenSSL
openssl rand -base64 32
```

## Docker Environment

### docker-compose.yml
```yaml
version: '3.8'
services:
  app:
    build: .
    environment:
      - DB_NAME=${DB_NAME}
      - DB_USER=${DB_USER}
      - DB_PASS=${DB_PASS}
      - DB_HOST=postgres
      - JWT_SECRET=${JWT_SECRET}
      - NODE_ENV=production
    depends_on:
      - postgres
  
  postgres:
    image: postgres:13
    environment:
      - POSTGRES_DB=${DB_NAME}
      - POSTGRES_USER=${DB_USER}
      - POSTGRES_PASSWORD=${DB_PASS}
```

## Monitoring

The application provides comprehensive monitoring:
- Environment validation on startup
- Database health checks every 30 seconds
- Graceful shutdown handling
- Process signal handling
- Memory and uptime monitoring