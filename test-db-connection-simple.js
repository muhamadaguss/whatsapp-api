require("dotenv").config();
const { Sequelize } = require("sequelize");

async function testConnection() {
  const sequelize = new Sequelize({
    dialect: "postgres",
    host: process.env.DB_HOST || "localhost",
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME,
    username: process.env.DB_USER,
    password: String(process.env.DB_PASS || process.env.DB_PASSWORD),
    logging: console.log,
  });

  try {
    console.log("🔄 Testing database connection...");
    await sequelize.authenticate();
    console.log("✅ Database connection successful!");

    // Test if chat_messages table exists
    const [results] = await sequelize.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'chat_messages' 
      ORDER BY ordinal_position;
    `);

    console.log("📊 chat_messages table structure:");
    results.forEach((col) => {
      console.log(
        `  - ${col.column_name}: ${col.data_type} (${
          col.is_nullable === "YES" ? "nullable" : "not null"
        })`
      );
    });

    // Check if messageType and mediaUrl columns exist
    const hasMessageType = results.some(
      (col) => col.column_name === "messageType"
    );
    const hasMediaUrl = results.some((col) => col.column_name === "mediaUrl");

    console.log(`🔍 messageType column exists: ${hasMessageType}`);
    console.log(`🔍 mediaUrl column exists: ${hasMediaUrl}`);

    if (!hasMessageType || !hasMediaUrl) {
      console.log("⚠️ Missing columns detected. Run migration needed.");
    } else {
      console.log("✅ All required columns exist.");
    }
  } catch (error) {
    console.error("❌ Database connection failed:", error.message);
  } finally {
    await sequelize.close();
  }
}

testConnection();
