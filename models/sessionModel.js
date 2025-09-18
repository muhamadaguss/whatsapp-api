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
    displayName: { type: DataTypes.STRING, allowNull: true },
    profilePicture: { type: DataTypes.TEXT, allowNull: true },
    lastSeen: { type: DataTypes.DATE, allowNull: true },
    connectionQuality: { 
      type: DataTypes.ENUM('excellent', 'good', 'fair', 'poor', 'unknown'), 
      defaultValue: 'unknown' 
    },
    healthScore: {
      type: DataTypes.INTEGER,
      defaultValue: 100,
      allowNull: false,
      validate: {
        min: 0,
        max: 100
      }
    },
    lastStatusCheck: {
      type: DataTypes.DATE,
      allowNull: true
    },
    lastHeartbeat: {
      type: DataTypes.DATE,
      allowNull: true
    },
    statusMetadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    },
    isBlocked: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false
    },
    blockedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    lastError: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    errorCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
      validate: {
        min: 0
      }
    },
    metadata: { type: DataTypes.JSONB, allowNull: true },
  },
  {
    timestamps: true,
    tableName: "sessions",
    indexes: [
      {
        name: 'idx_sessions_status_blocked',
        fields: ['status', 'isBlocked']
      },
      {
        name: 'idx_sessions_quality_health',
        fields: ['connectionQuality', 'healthScore']
      },
      {
        name: 'idx_sessions_last_status_check',
        fields: ['lastStatusCheck']
      }
    ]
  }
);

// Association function for relationships
Session.associate = function(models) {
  // Relationship with User
  Session.belongsTo(models.User, { foreignKey: "userId", as: "user" });
  
  // Relationship with BlastSession
  Session.hasMany(models.BlastSession, {
    foreignKey: 'whatsappSessionId',
    sourceKey: 'sessionId',
    as: 'blastSessions'
  });
};

module.exports = Session;
