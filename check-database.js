const sequelize = require("./models/db");

async function checkDatabase() {
  console.log("🔍 Checking database connection...\n");

  try {
    // Test connection
    await sequelize.authenticate();
    console.log("✅ Database connection successful!");

    // Get database info
    const dbConfig = sequelize.config;
    console.log("\n📊 Database Configuration:");
    console.log(`   Host: ${dbConfig.host}:${dbConfig.port}`);
    console.log(`   Database: ${dbConfig.database}`);
    console.log(`   User: ${dbConfig.username}`);
    console.log(`   Dialect: ${dbConfig.dialect}`);

    // Test query
    const [results] = await sequelize.query("SELECT version()");
    console.log(`\n🗄️ PostgreSQL Version: ${results[0].version}`);

    // Check if chat_messages table exists
    const [tables] = await sequelize.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'chat_messages'
    `);

    if (tables.length > 0) {
      console.log("✅ chat_messages table exists");

      // Check if contactName column exists
      const [columns] = await sequelize.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns 
        WHERE table_name = 'chat_messages'
        AND column_name IN ('contactName', 'isRead')
      `);

      console.log("\n📋 Relevant columns in chat_messages:");
      columns.forEach((col) => {
        console.log(
          `   - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`
        );
      });

      if (columns.find((col) => col.column_name === "contactName")) {
        console.log(
          "✅ contactName column exists - ready for contact name feature"
        );
      } else {
        console.log("⚠️ contactName column missing - run migration first");
      }

      if (columns.find((col) => col.column_name === "isRead")) {
        console.log("✅ isRead column exists - ready for unread feature");
      } else {
        console.log("⚠️ isRead column missing - run migration first");
      }
    } else {
      console.log(
        "⚠️ chat_messages table does not exist - run migrations first"
      );
    }

    console.log("\n🎉 Database check completed successfully!");
  } catch (error) {
    console.error("❌ Database connection failed:");
    console.error("Error:", error.message);

    console.error("\n🔧 Troubleshooting steps:");
    console.error("1. Check if PostgreSQL is running:");
    console.error("   - Local: brew services start postgresql (macOS)");
    console.error("   - Docker: docker-compose up -d postgres");
    console.error("   - Service: sudo systemctl start postgresql (Linux)");

    console.error("\n2. Verify database credentials in .env file:");
    console.error("   - DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASS");

    console.error("\n3. Test connection manually:");
    console.error(
      "   - psql -h 192.168.0.200 -p 5432 -U postgres -d whatsapp_blast"
    );

    console.error("\n4. Check firewall/network:");
    console.error("   - ping 192.168.0.200");
    console.error("   - telnet 192.168.0.200 5432");

    process.exit(1);
  }
}

checkDatabase();
