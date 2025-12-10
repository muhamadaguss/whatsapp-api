const { Sequelize } = require("sequelize");
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  String(process.env.DB_PASS), 
  {
    host: process.env.DB_HOST || "localhost",
    port: process.env.DB_PORT || 5432,
    dialect: "postgres",
    logging: process.env.NODE_ENV === "development" ? console.log : false,
    pool: {
      max: 20, 
      min: 0, 
      acquire: 30000, 
      idle: 10000, 
      evict: 1000, 
    },
    retry: {
      max: 3, 
      timeout: 5000, 
    },
    dialectOptions: {
      connectTimeout: 20000, 
      requestTimeout: 30000, 
      ...(process.env.NODE_ENV === "production" && process.env.DB_SSL === "true"
        ? {
            ssl: {
              require: true,
              rejectUnauthorized: false,
            },
          }
        : {}),
    },
    query: {
      timeout: 30000, 
    },
    timezone: "+00:00",
    define: {
      timestamps: true,
      underscored: false,
      freezeTableName: false, 
    },
  }
);
module.exports = sequelize;
