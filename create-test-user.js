#!/usr/bin/env node

require("dotenv").config();
const bcrypt = require("bcryptjs");
const UserModel = require("./models/userModel");
const sequelize = require("./models/db");

async function createTestUser() {
  console.log("👤 Creating test user...\n");

  try {
    // Ensure database connection
    await sequelize.authenticate();
    console.log("✅ Database connected");

    // Sync models
    await sequelize.sync();
    console.log("✅ Models synced");

    const testUsers = [
      {
        username: "admin",
        password: "password",
        role: "Admin",
        isActive: true,
      },
      {
        username: "yayang",
        password: "12345678",
        role: "User",
        isActive: true,
      },
    ];

    for (const userData of testUsers) {
      // Check if user already exists
      const existingUser = await UserModel.findOne({
        where: { username: userData.username },
      });

      if (existingUser) {
        console.log(
          `⚠️ User '${userData.username}' already exists, skipping...`
        );
        continue;
      }

      // Hash password
      const hashedPassword = bcrypt.hashSync(userData.password, 10);

      // Create user
      const user = await UserModel.create({
        username: userData.username,
        password: hashedPassword,
        role: userData.role,
        isActive: userData.isActive,
      });

      console.log(`✅ Created user: ${user.username} (${user.role})`);
    }

    console.log("\n🎉 Test users created successfully!");
  } catch (error) {
    console.error("❌ Error creating test users:", error.message);
    console.error("Stack:", error.stack);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

createTestUser();
