#!/usr/bin/env node

require("dotenv").config();
const bcrypt = require("bcryptjs");
const UserModel = require("./models/userModel");
const sequelize = require("./models/db");

async function createCommonUsers() {
  console.log("👥 Creating common test users...\n");

  try {
    // Ensure database connection
    await sequelize.authenticate();
    console.log("✅ Database connected");

    // Common test users with different passwords
    const commonUsers = [
      {
        username: "admin",
        password: "password",
        role: "Admin",
        isActive: true,
        description: 'Admin with password "password"',
      },
      {
        username: "admin2",
        password: "admin123",
        role: "Admin",
        isActive: true,
        description: 'Admin with password "admin123"',
      },
      {
        username: "test",
        password: "test123",
        role: "User",
        isActive: true,
        description: 'Test user with password "test123"',
      },
      {
        username: "demo",
        password: "demo",
        role: "User",
        isActive: true,
        description: 'Demo user with password "demo"',
      },
    ];

    for (const userData of commonUsers) {
      // Check if user already exists
      const existingUser = await UserModel.findOne({
        where: { username: userData.username },
      });

      if (existingUser) {
        // Update existing user password
        const hashedPassword = bcrypt.hashSync(userData.password, 10);
        await existingUser.update({
          password: hashedPassword,
          role: userData.role,
          isActive: userData.isActive,
        });
        console.log(
          `🔄 Updated user: ${userData.username} - ${userData.description}`
        );
      } else {
        // Create new user
        const hashedPassword = bcrypt.hashSync(userData.password, 10);
        const user = await UserModel.create({
          username: userData.username,
          password: hashedPassword,
          role: userData.role,
          isActive: userData.isActive,
        });
        console.log(
          `✅ Created user: ${userData.username} - ${userData.description}`
        );
      }
    }

    console.log("\n📋 Available test credentials:");
    console.log("┌─────────────┬─────────────┬─────────┐");
    console.log("│ Username    │ Password    │ Role    │");
    console.log("├─────────────┼─────────────┼─────────┤");
    console.log("│ admin       │ password    │ Admin   │");
    console.log("│ admin2      │ admin123    │ Admin   │");
    console.log("│ test        │ test123     │ User    │");
    console.log("│ demo        │ demo        │ User    │");
    console.log("└─────────────┴─────────────┴─────────┘");

    console.log("\n🎉 Common test users setup completed!");
  } catch (error) {
    console.error("❌ Error creating users:", error.message);
    console.error("Stack:", error.stack);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

createCommonUsers();
