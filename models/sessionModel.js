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
    displayName: { type: DataTypes.STRING, allowNull: true },
    profilePicture: { type: DataTypes.TEXT, allowNull: true },
    lastSeen: { type: DataTypes.DATE, allowNull: true },
    connectionQuality: { 
      type: DataTypes.ENUM('excellent', 'good', 'poor', 'unknown'), 
      defaultValue: 'unknown' 
    },
    metadata: { type: DataTypes.JSONB, allowNull: true },
  },
  {
    timestamps: true,
    tableName: "sessions",
  }
);
Session.associate = function(models) {
  Session.belongsTo(models.User, { foreignKey: "userId", as: "user" });
  Session.hasMany(models.BlastSession, {
    foreignKey: 'whatsappSessionId',
    sourceKey: 'sessionId',
    as: 'blastSessions'
  });
};
module.exports = Session;
