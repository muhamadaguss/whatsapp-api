/**
 * Phone Validation Cache Model - PHASE 3 [P3-3]
 * 
 * Database model for Layer 3 cache (persistent, 7-day TTL)
 * 
 * @module phoneValidationCacheModel
 */

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const PhoneValidationCache = sequelize.define(
  "PhoneValidationCache",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    phone_number: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: true,
      index: true,
      comment: "Phone number (with country code)"
    },
    exists: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: "Whether phone number exists on WhatsApp"
    },
    jid: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: "WhatsApp JID if exists"
    },
    validated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      index: true,
      comment: "When validation was performed"
    }
  },
  {
    tableName: "phone_validation_cache",
    timestamps: true,
    indexes: [
      {
        name: "idx_phone_number",
        fields: ["phone_number"]
      },
      {
        name: "idx_validated_at",
        fields: ["validated_at"]
      }
    ]
  }
);

module.exports = PhoneValidationCache;
