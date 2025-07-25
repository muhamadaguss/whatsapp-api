#!/usr/bin/env node

require("dotenv").config();
const bcrypt = require("bcryptjs");
const UserModel = require("./models/userModel");
const sequelize = require("./models/db");

async function updateAdminPassword() {
  console.log("🔐 Updating admin password...\n");

  try {
    // Ensure database connection
    await sequelize.authenticate();
    console.log("✅ Database connected");

    // Find admin user
    const adminUser = await UserModel.findOne({
      where: { username: "admin" },
    });

    if (!adminUser) {
      console.log("❌ Admin user not found");
      return;
    }

    console.log("👤 Found admin user:", adminUser.username);

    // Hash new password
    const newPassword = "password";
    const hashedPassword = bcrypt.hashSync(newPassword, 10);

    // Update password
    await adminUser.update({
      password: hashedPassword,
    });

    console.log("✅ Admin password updated successfully!");
    console.log(`📝 New password: "${newPassword}"`);

    // Test the new password
    const testUser = await UserModel.findOne({
      where: { username: "admin" },
    });

    const isValid = bcrypt.compareSync(newPassword, testUser.password);
    console.log(`🧪 Password test: ${isValid ? "✅ VALID" : "❌ INVALID"}`);
  } catch (error) {
    console.error("❌ Error updating password:", error.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

updateAdminPassword();
