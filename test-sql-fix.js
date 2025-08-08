const { Op } = require("sequelize");
const sequelize = require("./models/db");
const Blast = require("./models/blastModel");

// Test script untuk menguji query SQL yang sudah diperbaiki
async function testMessageTrendsQuery() {
  console.log("🧪 Testing Message Trends SQL Query...");

  try {
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999
    );

    // Test untuk monthly period (yang error sebelumnya)
    const groupByExpression = sequelize.fn(
      "TO_CHAR",
      sequelize.col("createdAt"),
      '"Day "DD'
    );
    const orderByExpression = sequelize.fn(
      "EXTRACT",
      sequelize.literal('DAY FROM "createdAt"')
    );

    console.log("📅 Testing monthly period query...");
    console.log(
      `Date range: ${startDate.toISOString()} to ${endDate.toISOString()}`
    );

    const trends = await Blast.findAll({
      attributes: [
        [groupByExpression, "name"],
        [sequelize.fn("SUM", sequelize.col("sentCount")), "success"],
        [sequelize.fn("SUM", sequelize.col("failedCount")), "failed"],
        [sequelize.fn("SUM", sequelize.col("totalRecipients")), "total"],
      ],
      where: {
        userId: 1, // Test dengan user ID 1
        createdAt: {
          [Op.between]: [startDate, endDate],
        },
      },
      group: [groupByExpression, orderByExpression], // Fix: tambahkan orderByExpression ke GROUP BY
      order: [[orderByExpression, "ASC"]],
      raw: true,
    });

    console.log("✅ Query executed successfully!");
    console.log("📊 Results:", JSON.stringify(trends, null, 2));

    // Test untuk weekly period
    console.log("\n📅 Testing weekly period query...");
    const day = now.getDay();
    const diffToMonday = (day === 0 ? -6 : 1) - day;
    const weekStartDate = new Date(now);
    weekStartDate.setDate(now.getDate() + diffToMonday);
    weekStartDate.setHours(0, 0, 0, 0);
    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setDate(weekStartDate.getDate() + 6);
    weekEndDate.setHours(23, 59, 59, 999);

    const weeklyGroupBy = sequelize.fn(
      "TO_CHAR",
      sequelize.col("createdAt"),
      "Dy"
    );
    const weeklyOrderBy = sequelize.fn(
      "EXTRACT",
      sequelize.literal('DOW FROM "createdAt"')
    );

    const weeklyTrends = await Blast.findAll({
      attributes: [
        [weeklyGroupBy, "name"],
        [sequelize.fn("SUM", sequelize.col("sentCount")), "success"],
        [sequelize.fn("SUM", sequelize.col("failedCount")), "failed"],
        [sequelize.fn("SUM", sequelize.col("totalRecipients")), "total"],
      ],
      where: {
        userId: 1,
        createdAt: {
          [Op.between]: [weekStartDate, weekEndDate],
        },
      },
      group: [weeklyGroupBy, weeklyOrderBy],
      order: [[weeklyOrderBy, "ASC"]],
      raw: true,
    });

    console.log("✅ Weekly query executed successfully!");
    console.log("📊 Weekly Results:", JSON.stringify(weeklyTrends, null, 2));

    // Test untuk today period
    console.log("\n📅 Testing today period query...");
    const todayStart = new Date(now.setHours(0, 0, 0, 0));
    const todayEnd = new Date(now.setHours(23, 59, 59, 999));

    const todayGroupBy = sequelize.fn(
      "TO_CHAR",
      sequelize.col("createdAt"),
      'HH24":00"'
    );
    const todayOrderBy = sequelize.fn(
      "EXTRACT",
      sequelize.literal('HOUR FROM "createdAt"')
    );

    const todayTrends = await Blast.findAll({
      attributes: [
        [todayGroupBy, "name"],
        [sequelize.fn("SUM", sequelize.col("sentCount")), "success"],
        [sequelize.fn("SUM", sequelize.col("failedCount")), "failed"],
        [sequelize.fn("SUM", sequelize.col("totalRecipients")), "total"],
      ],
      where: {
        userId: 1,
        createdAt: {
          [Op.between]: [todayStart, todayEnd],
        },
      },
      group: [todayGroupBy, todayOrderBy],
      order: [[todayOrderBy, "ASC"]],
      raw: true,
    });

    console.log("✅ Today query executed successfully!");
    console.log("📊 Today Results:", JSON.stringify(todayTrends, null, 2));
  } catch (error) {
    console.error("❌ Query failed:", error.message);
    console.error("📋 Full error:", error);
  }

  process.exit(0);
}

// Jalankan test
testMessageTrendsQuery();
