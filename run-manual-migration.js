const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

// Read database connection from .env
require("dotenv").config();

const dbConfig = {
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
};

console.log("🔄 Running manual database migration...");
console.log(
  `📊 Database: ${dbConfig.database} on ${dbConfig.host}:${dbConfig.port}`
);

// Read the SQL migration file
const sqlFile = path.join(__dirname, "manual-migration.sql");
const sqlContent = fs.readFileSync(sqlFile, "utf8");

// Create psql command
const psqlCommand = `PGPASSWORD="${dbConfig.password}" psql -h ${
  dbConfig.host
} -p ${dbConfig.port} -U ${dbConfig.username} -d ${
  dbConfig.database
} -c "${sqlContent.replace(/"/g, '\\"')}"`;

console.log("🔄 Executing migration...");

exec(psqlCommand, (error, stdout, stderr) => {
  if (error) {
    console.error("❌ Migration failed:", error.message);
    return;
  }

  if (stderr) {
    console.error("⚠️ Migration warnings:", stderr);
  }

  if (stdout) {
    console.log("✅ Migration output:", stdout);
  }

  console.log("✅ Migration completed successfully!");

  // Verify the migration
  const verifyCommand = `PGPASSWORD="${dbConfig.password}" psql -h ${dbConfig.host} -p ${dbConfig.port} -U ${dbConfig.username} -d ${dbConfig.database} -c "\\d chat_messages"`;

  exec(verifyCommand, (verifyError, verifyStdout, verifyStderr) => {
    if (verifyError) {
      console.error("❌ Verification failed:", verifyError.message);
      return;
    }

    console.log("🔍 Table structure verification:");
    console.log(verifyStdout);
  });
});
