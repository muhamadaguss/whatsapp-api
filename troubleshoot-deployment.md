# 🚨 Troubleshooting Deployment Issues

## Masalah yang Dilaporkan

### 1. Database Health Check Failed
```
[2025-07-25 00:01:59.424 +0000] ERROR: Database health check failed:
[2025-07-25 00:01:59.426 +0000] WARN: ⚠️  Database connection lost. Attempting to reconnect...
```

### 2. File Cleanup Errors
```
[2025-07-24 23:56:42.366 +0000] WARN: Cleanup errors:
```

---

## 🔧 Solusi Langkah demi Langkah

### Langkah 1: Jalankan Diagnostik Server
```bash
cd whatsapp
node diagnose-server.js
```

### Langkah 2: Periksa Status Database
```bash
# Cek apakah PostgreSQL berjalan
sudo systemctl status postgresql

# Jika tidak berjalan, start service
sudo systemctl start postgresql

# Test koneksi manual
psql -h $DB_HOST -U $DB_USER -d $DB_NAME
```

### Langkah 3: Periksa Environment Variables
```bash
# Cek semua environment variables
env | grep DB_
env | grep JWT_

# Pastikan semua variabel wajib ada:
# - DB_NAME
# - DB_USER  
# - DB_PASS
# - DB_HOST
# - JWT_SECRET
```

### Langkah 4: Periksa Permissions Directory
```bash
# Cek permissions directory
ls -la uploads/ logs/ sessions/ temp/

# Fix permissions jika diperlukan
chmod 755 uploads logs sessions temp
chown $USER:$USER uploads logs sessions temp
```

### Langkah 5: Setup Production Environment
```bash
# Jalankan setup production
node setup-production.js

# Atau manual setup
mkdir -p uploads logs sessions temp backups
chmod 755 uploads logs sessions temp backups
```

---

## 🔍 Debugging Commands

### Database Debugging
```bash
# Test database connection
node -e "
require('dotenv').config();
const { Sequelize } = require('sequelize');
const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASS, {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  dialect: 'postgres'
});
sequelize.authenticate().then(() => console.log('✅ DB OK')).catch(err => console.error('❌ DB Error:', err.message));
"

# Check database server status
sudo systemctl status postgresql
sudo journalctl -u postgresql -f

# Check database logs
sudo tail -f /var/log/postgresql/postgresql-*.log
```

### File System Debugging
```bash
# Check disk space
df -h

# Check directory permissions
ls -la uploads/ logs/ sessions/ temp/

# Check file cleanup process
node -e "
const FileCleanupManager = require('./utils/fileCleanup');
const cleanup = new FileCleanupManager({ dryRun: true });
cleanup.getCleanupStats().then(stats => console.log(JSON.stringify(stats, null, 2)));
"
```

### Application Debugging
```bash
# Run with debug logging
NODE_ENV=development node index.js

# Check application logs
tail -f logs/app.log

# Monitor system resources
htop
free -h
```

---

## 🛠️ Common Fixes

### Fix 1: Database Connection Issues

**Problem**: `ECONNREFUSED` atau `ENOTFOUND`

**Solution**:
```bash
# 1. Start PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

# 2. Create database if not exists
sudo -u postgres createdb whatsapp_blast

# 3. Create user if not exists
sudo -u postgres psql -c "CREATE USER your_user WITH PASSWORD 'your_password';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE whatsapp_blast TO your_user;"

# 4. Update .env file
DB_HOST=localhost
DB_PORT=5432
DB_NAME=whatsapp_blast
DB_USER=your_user
DB_PASS=your_password
```

### Fix 2: File Permission Issues

**Problem**: `EACCES` permission denied

**Solution**:
```bash
# Fix directory permissions
sudo chown -R $USER:$USER uploads logs sessions temp
chmod -R 755 uploads logs sessions temp

# Create directories if missing
mkdir -p uploads logs sessions temp backups
```

### Fix 3: Environment Variables Missing

**Problem**: Missing required environment variables

**Solution**:
```bash
# Copy example file
cp .env.example .env

# Edit with your values
nano .env

# Verify variables are loaded
node -e "require('dotenv').config(); console.log('DB_HOST:', process.env.DB_HOST);"
```

### Fix 4: Memory Issues

**Problem**: High memory usage or out of memory

**Solution**:
```bash
# Check memory usage
free -h
ps aux --sort=-%mem | head

# Increase swap if needed
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Add to /etc/fstab for permanent
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## 🚀 Production Deployment Checklist

### Pre-deployment
- [ ] Run `node diagnose-server.js`
- [ ] Verify all environment variables
- [ ] Test database connection
- [ ] Check directory permissions
- [ ] Verify SSL certificates (if using HTTPS)

### Deployment
- [ ] Run `node setup-production.js`
- [ ] Install systemd service
- [ ] Configure nginx/reverse proxy
- [ ] Set up log rotation
- [ ] Configure monitoring

### Post-deployment
- [ ] Test all endpoints
- [ ] Monitor logs for errors
- [ ] Verify database health checks
- [ ] Test file cleanup process
- [ ] Monitor system resources

---

## 📞 Emergency Commands

### Quick Health Check
```bash
curl http://localhost:3000/health
curl http://localhost:3000/ready
curl http://localhost:3000/shutdown/status
```

### Force Restart Application
```bash
# If using systemd
sudo systemctl restart whatsapp-api

# If running manually
pkill -f "node index.js"
nohup node index.js > logs/app.log 2>&1 &
```

### Emergency Database Reset
```bash
# CAUTION: This will delete all data!
sudo -u postgres dropdb whatsapp_blast
sudo -u postgres createdb whatsapp_blast
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE whatsapp_blast TO your_user;"
```

### Clean All Temporary Files
```bash
# Clean uploads
find uploads -type f -mtime +1 -delete

# Clean logs older than 7 days
find logs -name "*.log" -mtime +7 -delete

# Clean sessions older than 30 days
find sessions -type d -mtime +30 -exec rm -rf {} +
```

---

## 📊 Monitoring Commands

### Real-time Monitoring
```bash
# Monitor application logs
tail -f logs/app.log | grep -E "(ERROR|WARN|Database|Cleanup)"

# Monitor system resources
watch -n 1 'free -h && echo "---" && df -h && echo "---" && ps aux --sort=-%mem | head -5'

# Monitor database connections
watch -n 5 'sudo -u postgres psql -c "SELECT count(*) as connections FROM pg_stat_activity WHERE datname='\''whatsapp_blast'\'';"'
```

### Health Check Script
```bash
#!/bin/bash
echo "🏥 Health Check Report - $(date)"
echo "=================================="

# Application health
curl -s http://localhost:3000/health | jq '.status' || echo "❌ App not responding"

# Database health
curl -s http://localhost:3000/health | jq '.database.healthy' || echo "❌ DB health unknown"

# Disk space
echo "💾 Disk Usage:"
df -h | grep -E "(Filesystem|/dev/)"

# Memory usage
echo "🧠 Memory Usage:"
free -h

# Process status
echo "⚙️ Process Status:"
ps aux | grep -E "(node|postgres)" | grep -v grep
```

Simpan script ini sebagai `health-check.sh` dan jalankan dengan `bash health-check.sh`