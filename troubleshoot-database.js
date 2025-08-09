require("dotenv").config();
const { exec } = require("child_process");
const { promisify } = require("util");
const execAsync = promisify(exec);

async function troubleshootDatabase() {
  console.log("🔧 Database Connection Troubleshooting\n");

  const dbHost = process.env.DB_HOST || "192.168.0.200";
  const dbPort = process.env.DB_PORT || "5432";
  const dbName = process.env.DB_NAME || "whatsapp_blast";
  const dbUser = process.env.DB_USER || "postgres";

  console.log("📋 Configuration:");
  console.log(`   Host: ${dbHost}`);
  console.log(`   Port: ${dbPort}`);
  console.log(`   Database: ${dbName}`);
  console.log(`   User: ${dbUser}\n`);

  // Test 1: Ping host
  console.log("1. Testing network connectivity...");
  try {
    await execAsync(`ping -c 1 ${dbHost}`);
    console.log("✅ Host is reachable");
  } catch (error) {
    console.log("❌ Host is not reachable");
    console.log("   Solution: Check network connection or host IP");
  }

  // Test 2: Check port
  console.log("\n2. Testing port connectivity...");
  try {
    // Use nc (netcat) to test port
    await execAsync(`nc -z -v ${dbHost} ${dbPort}`, { timeout: 5000 });
    console.log("✅ Port is open");
  } catch (error) {
    console.log("❌ Port is not accessible");
    console.log("   Solutions:");
    console.log("   - Check if PostgreSQL is running");
    console.log("   - Check firewall settings");
    console.log("   - Verify port configuration");
  }

  // Test 3: Check Docker containers
  console.log("\n3. Checking Docker containers...");
  try {
    const { stdout } = await execAsync(
      'docker ps --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}"'
    );
    console.log("Docker containers:");
    console.log(stdout);

    if (stdout.includes("postgres")) {
      console.log("✅ PostgreSQL container is running");
    } else {
      console.log("⚠️ PostgreSQL container not found");
      console.log("   Solution: Run docker-compose up -d postgres");
    }
  } catch (error) {
    console.log("⚠️ Docker not available or no containers running");
  }

  // Test 4: Environment variables
  console.log("\n4. Checking environment variables...");
  const requiredEnvs = ["DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASS"];
  let envIssues = 0;

  requiredEnvs.forEach((env) => {
    if (process.env[env]) {
      console.log(`✅ ${env}: ${env === "DB_PASS" ? "***" : process.env[env]}`);
    } else {
      console.log(`❌ ${env}: not set`);
      envIssues++;
    }
  });

  if (envIssues > 0) {
    console.log("   Solution: Check .env file configuration");
  }

  // Test 5: Suggest solutions
  console.log("\n🔧 Suggested Solutions:\n");

  console.log("Option 1: Start local PostgreSQL with Docker");
  console.log("   cd .. && docker-compose up -d postgres");
  console.log("   # Then update .env: DB_HOST=localhost");

  console.log("\nOption 2: Use existing remote database");
  console.log("   # Ensure remote PostgreSQL is running");
  console.log("   # Check firewall allows connection from your IP");
  console.log("   # Verify credentials are correct");

  console.log("\nOption 3: Install PostgreSQL locally");
  console.log(
    "   # macOS: brew install postgresql && brew services start postgresql"
  );
  console.log(
    "   # Ubuntu: sudo apt install postgresql && sudo systemctl start postgresql"
  );
  console.log("   # Then update .env: DB_HOST=localhost");

  console.log("\n📝 Quick Commands:");
  console.log("   Check database: node check-database.js");
  console.log("   Start Docker DB: ./start-database.sh");
  console.log("   Run migrations: node run-migration.js");
  console.log("   Update contacts: node update-existing-contacts.js");
}

troubleshootDatabase().catch(console.error);
