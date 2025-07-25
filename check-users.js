#!/usr/bin/env node

require("dotenv").config();
const bcrypt = require("bcryptjs");
const UserModel = require("./models/userModel");
const sequelize = require("./models/db");

async function checkUsers() {
  console.log("👥 Checking existing users...\n");

  try {
    // Ensure database connection
    await sequelize.authenticate();
    console.log("✅ Database connected");

    // Get all users
    const users = await UserModel.findAll({
      attributes: ["id", "username", "role", "isActive", "createdAt"],
    });

    console.log(`📊 Found ${users.length} users:\n`);

    users.forEach((user) => {
      console.log(`👤 User: ${user.username}`);
      console.log(`   - ID: ${user.id}`);
      console.log(`   - Role: ${user.role}`);
      console.log(`   - Active: ${user.isActive}`);
      console.log(`   - Created: ${user.createdAt}`);
      console.log("");
    });

    // Test password for admin user
    const adminUser = await UserModel.findOne({
      where: { username: "admin" },
    });

    if (adminUser) {
      console.log("🔐 Testing passwords for admin user:");

      const testPasswords = ["admin123", "password", "admin"];

      for (const testPassword of testPasswords) {
        const isValid = bcrypt.compareSync(testPassword, adminUser.password);
        console.log(
          `   - "${testPassword}": ${isValid ? "✅ VALID" : "❌ INVALID"}`
        );
      }
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

checkUsers();
