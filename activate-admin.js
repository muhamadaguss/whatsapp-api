#!/usr/bin/env node

require("dotenv").config();
const UserModel = require("./models/userModel");
const sequelize = require("./models/db");

async function activateAdmin() {
  console.log("🔄 Activating admin user...\n");

  try {
    await sequelize.authenticate();
    console.log("✅ Database connected");

    const adminUser = await UserModel.findOne({
      where: { username: "admin" },
    });

    if (!adminUser) {
      console.log("❌ Admin user not found");
      return;
    }

    console.log(
      `👤 Found admin user: ${adminUser.username} (Active: ${adminUser.isActive})`
    );

    if (!adminUser.isActive) {
      await adminUser.update({ isActive: true });
      console.log("✅ Admin user activated successfully!");
    } else {
      console.log("ℹ️ Admin user is already active");
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

activateAdmin();
