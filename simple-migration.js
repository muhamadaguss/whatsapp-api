// Simple migration script that works with basic PostgreSQL connection
const { Client } = require("pg");
require("dotenv").config();

async function runMigration() {
  const client = new Client({
    host: process.env.DB_HOST || "localhost",
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: String(process.env.DB_PASS),
  });

  try {
    console.log("🔄 Connecting to database...");
    await client.connect();
    console.log("✅ Connected to database");

    // Check if columns already exist
    const checkQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'chat_messages' 
      AND column_name IN ('messageType', 'mediaUrl');
    `;

    const existingColumns = await client.query(checkQuery);
    const hasMessageType = existingColumns.rows.some(
      (row) => row.column_name === "messageType"
    );
    const hasMediaUrl = existingColumns.rows.some(
      (row) => row.column_name === "mediaUrl"
    );

    console.log(`🔍 messageType column exists: ${hasMessageType}`);
    console.log(`🔍 mediaUrl column exists: ${hasMediaUrl}`);

    // Add messageType column if it doesn't exist
    if (!hasMessageType) {
      console.log("🔄 Adding messageType column...");
      await client.query(`
        ALTER TABLE chat_messages 
        ADD COLUMN "messageType" VARCHAR(255) DEFAULT 'text' NOT NULL;
      `);
      console.log("✅ messageType column added");
    }

    // Add mediaUrl column if it doesn't exist
    if (!hasMediaUrl) {
      console.log("🔄 Adding mediaUrl column...");
      await client.query(`
        ALTER TABLE chat_messages 
        ADD COLUMN "mediaUrl" TEXT;
      `);
      console.log("✅ mediaUrl column added");
    }

    if (hasMessageType && hasMediaUrl) {
      console.log("✅ All columns already exist, no migration needed");
    }

    // Verify the migration
    const verifyQuery = `
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'chat_messages' 
      ORDER BY ordinal_position;
    `;

    const result = await client.query(verifyQuery);
    console.log("\n📊 Current table structure:");
    result.rows.forEach((row) => {
      console.log(
        `  - ${row.column_name}: ${row.data_type} (${
          row.is_nullable === "YES" ? "nullable" : "not null"
        })`
      );
    });

    console.log("\n✅ Migration completed successfully!");
  } catch (error) {
    console.error("❌ Migration failed:", error.message);

    if (error.message.includes("password authentication failed")) {
      console.log("\n🔧 Database connection troubleshooting:");
      console.log("1. Check if PostgreSQL is running");
      console.log("2. Verify database credentials in .env file");
      console.log("3. Ensure database and user exist");
      console.log("4. Check PostgreSQL pg_hba.conf for authentication method");
    }
  } finally {
    await client.end();
  }
}

runMigration();
