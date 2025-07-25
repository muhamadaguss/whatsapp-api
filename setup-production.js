#!/usr/bin/env node

/**
 * Production server setup script
 */

require("dotenv").config();

const fs = require("fs").promises;
const path = require("path");
const logger = require("./utils/logger");

async function setupProduction() {
  console.log("🚀 WhatsApp Blast API - Production Setup");
  console.log("========================================");

  try {
    // 1. Create required directories
    await createRequiredDirectories();

    // 2. Set proper permissions
    await setDirectoryPermissions();

    // 3. Validate environment
    await validateEnvironment();

    // 4. Test database connection
    await testDatabaseConnection();

    // 5. Create systemd service file (if on Linux)
    await createSystemdService();

    // 6. Create nginx configuration
    await createNginxConfig();

    console.log("\n✅ Production setup completed successfully!");
    console.log("\nNext steps:");
    console.log("1. Review generated configuration files");
    console.log("2. Start the application: npm start");
    console.log("3. Monitor logs: tail -f logs/app.log");
    console.log("4. Test endpoints: curl http://localhost:3000/health");
  } catch (error) {
    console.error("❌ Production setup failed:", error.message);
    process.exit(1);
  }
}

async function createRequiredDirectories() {
  console.log("📁 Creating required directories...");

  const directories = [
    "./uploads",
    "./logs",
    "./sessions",
    "./temp",
    "./backups",
  ];

  for (const dir of directories) {
    try {
      await fs.mkdir(dir, { recursive: true });
      console.log(`   ✅ Created: ${dir}`);
    } catch (error) {
      if (error.code !== "EEXIST") {
        throw new Error(`Failed to create directory ${dir}: ${error.message}`);
      }
      console.log(`   ℹ️  Exists: ${dir}`);
    }
  }
}

async function setDirectoryPermissions() {
  console.log("🔐 Setting directory permissions...");

  const { execSync } = require("child_process");
  const directories = [
    "./uploads",
    "./logs",
    "./sessions",
    "./temp",
    "./backups",
  ];

  try {
    for (const dir of directories) {
      // Set permissions: owner read/write/execute, group read/execute, others read/execute
      execSync(`chmod 755 ${dir}`, { stdio: "inherit" });
      console.log(`   ✅ Permissions set for: ${dir}`);
    }
  } catch (error) {
    console.warn(`   ⚠️  Could not set permissions: ${error.message}`);
  }
}

async function validateEnvironment() {
  console.log("🔍 Validating environment variables...");

  const required = ["DB_NAME", "DB_USER", "DB_PASS", "DB_HOST", "JWT_SECRET"];

  const missing = required.filter((varName) => !process.env[varName]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
  }

  // Validate JWT secret strength
  if (process.env.JWT_SECRET.length < 64) {
    console.warn(
      "   ⚠️  JWT_SECRET should be at least 64 characters for production"
    );
  }

  console.log("   ✅ Environment variables validated");
}

async function testDatabaseConnection() {
  console.log("🗄️  Testing database connection...");

  try {
    const sequelize = require("./models/db");
    await sequelize.authenticate();
    console.log("   ✅ Database connection successful");
    await sequelize.close();
  } catch (error) {
    throw new Error(`Database connection failed: ${error.message}`);
  }
}

async function createSystemdService() {
  console.log("⚙️  Creating systemd service file...");

  const serviceContent = `[Unit]
Description=WhatsApp Blast API
After=network.target postgresql.service

[Service]
Type=simple
User=\${USER}
WorkingDirectory=${process.cwd()}
Environment=NODE_ENV=production
ExecStart=${process.execPath} index.js
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=whatsapp-api

# Security settings
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${process.cwd()}

[Install]
WantedBy=multi-user.target
`;

  try {
    await fs.writeFile("whatsapp-api.service", serviceContent);
    console.log("   ✅ Systemd service file created: whatsapp-api.service");
    console.log(
      "   ℹ️  To install: sudo cp whatsapp-api.service /etc/systemd/system/"
    );
    console.log("   ℹ️  To enable: sudo systemctl enable whatsapp-api");
    console.log("   ℹ️  To start: sudo systemctl start whatsapp-api");
  } catch (error) {
    console.warn(`   ⚠️  Could not create systemd service: ${error.message}`);
  }
}

async function createNginxConfig() {
  console.log("🌐 Creating nginx configuration...");

  const nginxContent = `server {
    listen 80;
    server_name your-domain.com;  # Change this to your domain
    
    # Redirect HTTP to HTTPS
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;  # Change this to your domain
    
    # SSL configuration (update paths to your certificates)
    ssl_certificate /path/to/your/certificate.crt;
    ssl_certificate_key /path/to/your/private.key;
    
    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    
    # Proxy to Node.js application
    location / {
        proxy_pass http://localhost:${process.env.PORT || 3000};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    # Health check endpoint (no auth required)
    location /health {
        proxy_pass http://localhost:${process.env.PORT || 3000};
        access_log off;
    }
    
    # File upload size limit
    client_max_body_size 10M;
    
    # Gzip compression
    gzip on;
    gzip_types text/plain application/json application/javascript text/css;
}
`;

  try {
    await fs.writeFile("nginx-whatsapp-api.conf", nginxContent);
    console.log("   ✅ Nginx configuration created: nginx-whatsapp-api.conf");
    console.log(
      "   ℹ️  To install: sudo cp nginx-whatsapp-api.conf /etc/nginx/sites-available/"
    );
    console.log(
      "   ℹ️  To enable: sudo ln -s /etc/nginx/sites-available/nginx-whatsapp-api.conf /etc/nginx/sites-enabled/"
    );
    console.log(
      "   ℹ️  To reload: sudo nginx -t && sudo systemctl reload nginx"
    );
  } catch (error) {
    console.warn(`   ⚠️  Could not create nginx config: ${error.message}`);
  }
}

// Run setup if called directly
if (require.main === module) {
  setupProduction().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

module.exports = { setupProduction };
