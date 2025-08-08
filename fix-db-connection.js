const { Sequelize } = require("sequelize");
require("dotenv").config();

async function fixDatabaseConnection() {
  console.log("🔧 Fixing database connection issue...\n");

  // Debug environment variables
  console.log("1. Checking environment variables:");
  console.log(`DB_NAME: ${process.env.DB_NAME}`);
  console.log(`DB_USER: ${process.env.DB_USER}`);
  console.log(`DB_PASS: ${process.env.DB_PASS ? "[HIDDEN]" : "UNDEFINED"}`);
  console.log(`DB_HOST: ${process.env.DB_HOST}`);
  console.log(`DB_PORT: ${process.env.DB_PORT}`);
  console.log();

  // Check if password is properly loaded
  if (!process.env.DB_PASS) {
    console.log("❌ DB_PASS is undefined!");
    console.log("Please check your .env file");
    return;
  }

  // Ensure password is a string
  const dbConfig = {
    database: process.env.DB_NAME,
    username: process.env.DB_USER,
    password: String(process.env.DB_PASS), // Explicitly convert to string
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT) || 5432,
    dialect: "postgres",
    logging: false,

    // Add connection timeout and retry logic
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },

    dialectOptions: {
      connectTimeout: 20000,
      requestTimeout: 30000,
    },

    retry: {
      max: 3,
      timeout: 5000,
    },
  };

  console.log("2. Testing connection with explicit string conversion...");

  try {
    const sequelize = new Sequelize(dbConfig);

    await sequelize.authenticate();
    console.log("✅ Database connection successful!");

    // Test a simple query
    console.log("\n3. Testing simple query...");
    const [results] = await sequelize.query("SELECT NOW() as current_time");
    console.log(`Current database time: ${results[0].current_time}`);

    await sequelize.close();
    console.log("✅ Connection closed successfully");
  } catch (error) {
    console.log("❌ Connection still failed:");
    console.error(error.message);

    // Try alternative connection methods
    console.log("\n4. Trying alternative connection string...");
    try {
      const connectionString = `postgresql://${
        process.env.DB_USER
      }:${encodeURIComponent(process.env.DB_PASS)}@${process.env.DB_HOST}:${
        process.env.DB_PORT
      }/${process.env.DB_NAME}`;

      const sequelize2 = new Sequelize(connectionString, {
        dialect: "postgres",
        logging: false,
      });

      await sequelize2.authenticate();
      console.log("✅ Alternative connection method successful!");
      await sequelize2.close();
    } catch (altError) {
      console.log("❌ Alternative method also failed:");
      console.error(altError.message);
    }
  }
}

fixDatabaseConnection().catch(console.error);
