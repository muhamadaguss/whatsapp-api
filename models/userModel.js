// /api/models/user.model.js
const { DataTypes } = require("sequelize");
const sequelize = require("./db");

const User = sequelize.define(
  "User",
  {
    username: { type: DataTypes.STRING, allowNull: false, unique: true },
    password: { type: DataTypes.STRING, allowNull: false },
    role: { type: DataTypes.ENUM("Admin", "User"), defaultValue: "User" },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
  },
  {
    timestamps: true,
    tableName: "users", // Explicitly set table name to 'users'
  }
);

module.exports = User;
