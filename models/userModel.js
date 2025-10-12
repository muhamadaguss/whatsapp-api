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
    
    // SaaS Multi-Tenant Fields
    organizationId: {
      type: DataTypes.UUID,
      allowNull: true, // NULL for super admins, required for regular users
      references: {
        model: 'organizations',
        key: 'id'
      },
      comment: 'Organization ID - NULL for super admins'
    },
    roleInOrg: {
      type: DataTypes.ENUM('owner', 'admin', 'member', 'guest'),
      defaultValue: 'member',
      allowNull: true, // NULL for super admins
      comment: 'Role within organization - NULL for super admins'
    },
    
    // Super Admin Support
    isSuperAdmin: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Platform super administrator - bypasses tenant isolation'
    },
    lastAdminAccessAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Last time super admin accessed admin features'
    }
  },
  {
    timestamps: true,
    tableName: "users", // Explicitly set table name to 'users'
    underscored: true, // Use snake_case for column names in database
  }
);

module.exports = User;
