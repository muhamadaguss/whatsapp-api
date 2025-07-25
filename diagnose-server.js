#!/usr/bin/env node

/**
 * Server diagnostics script for production deployment troubleshooting
 */

require("dotenv").config();

const ServerDiagnostics = require("./utils/serverDiagnostics");
const logger = require("./utils/logger");

async function runServerDiagnostics() {
  console.log("🔍 WhatsApp Blast API - Server Diagnostics");
  console.log("==========================================");

  try {
    const diagnostics = new ServerDiagnostics();
    const results = await diagnostics.runDiagnostics();

    // Generate recommendations based on results
    const recommendations = generateRecommendations(results);

    console.log("\n📋 RECOMMENDATIONS:");
    console.log("===================");

    if (recommendations.length === 0) {
      console.log("✅ No issues detected. Server appears to be healthy.");
    } else {
      recommendations.forEach((rec, index) => {
        console.log(`${index + 1}. ${rec.issue}`);
        console.log(`   Solution: ${rec.solution}`);
        if (rec.command) {
          console.log(`   Command: ${rec.command}`);
        }
        console.log("");
      });
    }

    // Generate environment-specific fixes
    console.log("\n🔧 ENVIRONMENT-SPECIFIC FIXES:");
    console.log("==============================");

    if (process.env.NODE_ENV === "production") {
      console.log("Production Environment Detected:");
      console.log("1. Ensure PostgreSQL service is running");
      console.log("2. Check firewall rules for database port");
      console.log("3. Verify SSL certificates if using HTTPS");
      console.log("4. Monitor disk space for file cleanup");
    } else {
      console.log("Development Environment:");
      console.log("1. Check if PostgreSQL is installed and running locally");
      console.log("2. Verify .env file configuration");
      console.log("3. Ensure all required directories exist");
    }

    // Save diagnostic results to file
    const fs = require("fs").promises;
    const diagnosticFile = `diagnostic-${Date.now()}.json`;
    await fs.writeFile(diagnosticFile, JSON.stringify(results, null, 2));
    console.log(`\n💾 Diagnostic results saved to: ${diagnosticFile}`);
  } catch (error) {
    console.error("❌ Diagnostic failed:", error.message);
    process.exit(1);
  }
}

function generateRecommendations(results) {
  const recommendations = [];

  // Database recommendations
  const db = results.diagnostics.database;
  if (!db.connection) {
    if (db.errors.some((e) => e.code === "ECONNREFUSED")) {
      recommendations.push({
        issue: "Database connection refused",
        solution:
          "Start PostgreSQL service and verify it's listening on the correct port",
        command: "sudo systemctl start postgresql",
      });
    } else if (db.errors.some((e) => e.code === "ENOTFOUND")) {
      recommendations.push({
        issue: "Database host not found",
        solution: "Check DB_HOST environment variable and DNS resolution",
        command: "nslookup $DB_HOST",
      });
    } else if (db.errors.some((e) => e.message.includes("authentication"))) {
      recommendations.push({
        issue: "Database authentication failed",
        solution: "Verify DB_USER and DB_PASS environment variables",
        command: "psql -h $DB_HOST -U $DB_USER -d $DB_NAME",
      });
    } else {
      recommendations.push({
        issue: "Database connection failed",
        solution: "Check database server status and network connectivity",
      });
    }
  }

  // File system recommendations
  const fs = results.diagnostics.filesystem;
  if (fs.status !== "healthy") {
    fs.errors.forEach((error) => {
      if (error.error.includes("EACCES")) {
        recommendations.push({
          issue: `Permission denied for directory: ${error.directory}`,
          solution: "Fix directory permissions",
          command: `chmod 755 ${error.directory} && chown $USER:$USER ${error.directory}`,
        });
      } else if (error.error.includes("ENOENT")) {
        recommendations.push({
          issue: `Directory missing: ${error.directory}`,
          solution: "Create the required directory",
          command: `mkdir -p ${error.directory}`,
        });
      }
    });
  }

  // Environment recommendations
  const env = results.diagnostics.environment;
  if (env.status !== "healthy") {
    env.errors.forEach((error) => {
      recommendations.push({
        issue: `Missing environment variable: ${error.variable}`,
        solution:
          "Set the required environment variable in .env file or system environment",
      });
    });
  }

  // Memory recommendations
  const mem = results.diagnostics.memory;
  if (mem.errors.length > 0) {
    recommendations.push({
      issue: "High memory usage detected",
      solution: "Monitor memory usage and consider increasing server resources",
      command: "free -h && ps aux --sort=-%mem | head",
    });
  }

  return recommendations;
}

// Run diagnostics if called directly
if (require.main === module) {
  runServerDiagnostics().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

module.exports = { runServerDiagnostics };
