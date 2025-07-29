// /api/models/db.js
const { Sequelize } = require("sequelize");

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  String(process.env.DB_PASS), // Explicitly convert to string to avoid SASL errors
  {
    host: process.env.DB_HOST || "localhost",
    port: process.env.DB_PORT || 5432,
    dialect: "postgres",
    logging: process.env.NODE_ENV === "development" ? console.log : false,

    // Connection pool configuration for production
    pool: {
      max: 20, // Maximum number of connections
      min: 0, // Minimum number of connections
      acquire: 30000, // Maximum time to get connection (30s)
      idle: 10000, // Maximum time connection can be idle (10s)
      evict: 1000, // Check for idle connections every 1s
    },

    // Retry configuration
    retry: {
      max: 3, // Maximum retry attempts
      timeout: 5000, // Timeout between retries
    },

    // Connection timeout
    dialectOptions: {
      connectTimeout: 20000, // 20 seconds
      requestTimeout: 30000, // 30 seconds

      // SSL configuration for production
      ...(process.env.NODE_ENV === "production" && process.env.DB_SSL === "true"
        ? {
            ssl: {
              require: true,
              rejectUnauthorized: false,
            },
          }
        : {}),
    },

    // Query timeout
    query: {
      timeout: 30000, // 30 seconds
    },

    // Timezone configuration
    timezone: "+00:00",

    // Define associations
    define: {
      timestamps: true,
      underscored: false,
      freezeTableName: false, // Allow pluralization: User -> users
    },
  }
);

module.exports = sequelize;
