// /api/models/session.model.js
const { DataTypes } = require("sequelize");
const sequelize = require("./db");
const User = require("./userModel");

const Session = sequelize.define(
  "Session",
  {
    sessionId: { type: DataTypes.STRING, unique: true },
    status: { type: DataTypes.STRING, defaultValue: "pending" },
    userId: {
      type: DataTypes.INTEGER,
      references: {
        model: User,
        key: "id",
      },
    },
    phoneNumber: { type: DataTypes.STRING },
  },
  {
    timestamps: true,
    tableName: "sessions",
  }
);

Session.belongsTo(User, { foreignKey: "userId", as: "user" });

module.exports = Session;
