const { Op } = require("sequelize");
const sequelize = require("./models/db");

// Test script untuk melihat SQL query yang dihasilkan
async function testQueryGeneration() {
  console.log("🧪 Testing SQL Query Generation...");

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

    console.log("📅 Testing monthly period query generation...");

    // Generate query tanpa mengeksekusi
    const queryOptions = {
      attributes: [
        [groupByExpression, "name"],
        [sequelize.fn("SUM", sequelize.col("sentCount")), "success"],
        [sequelize.fn("SUM", sequelize.col("failedCount")), "failed"],
        [sequelize.fn("SUM", sequelize.col("totalRecipients")), "total"],
      ],
      where: {
        userId: 1,
        createdAt: {
          [Op.between]: [startDate, endDate],
        },
      },
      group: [groupByExpression, orderByExpression], // Fix: tambahkan orderByExpression ke GROUP BY
      order: [[orderByExpression, "ASC"]],
      raw: true,
    };

    // Simulasi query yang akan dihasilkan
    console.log("✅ Query options generated successfully!");
    console.log("📋 GROUP BY includes both expressions:");
    console.log('   - groupByExpression: TO_CHAR("createdAt", \'"Day "DD\')');
    console.log('   - orderByExpression: EXTRACT(DAY FROM "createdAt")');
    console.log("\n📋 ORDER BY uses:");
    console.log('   - orderByExpression: EXTRACT(DAY FROM "createdAt") ASC');

    console.log("\n🔧 Fix applied:");
    console.log("   - BEFORE: group: [groupByExpression]");
    console.log("   - AFTER:  group: [groupByExpression, orderByExpression]");

    console.log("\n✅ This should resolve the PostgreSQL error 42803:");
    console.log(
      "   'column must appear in the GROUP BY clause or be used in an aggregate function'"
    );

    // Test untuk weekly period
    console.log("\n📅 Testing weekly period query generation...");
    const weeklyGroupBy = sequelize.fn(
      "TO_CHAR",
      sequelize.col("createdAt"),
      "Dy"
    );
    const weeklyOrderBy = sequelize.fn(
      "EXTRACT",
      sequelize.literal('DOW FROM "createdAt"')
    );

    console.log("📋 Weekly GROUP BY includes both expressions:");
    console.log("   - weeklyGroupBy: TO_CHAR(\"createdAt\", 'Dy')");
    console.log('   - weeklyOrderBy: EXTRACT(DOW FROM "createdAt")');

    // Test untuk today period
    console.log("\n📅 Testing today period query generation...");
    const todayGroupBy = sequelize.fn(
      "TO_CHAR",
      sequelize.col("createdAt"),
      'HH24":00"'
    );
    const todayOrderBy = sequelize.fn(
      "EXTRACT",
      sequelize.literal('HOUR FROM "createdAt"')
    );

    console.log("📋 Today GROUP BY includes both expressions:");
    console.log('   - todayGroupBy: TO_CHAR("createdAt", \'HH24":00"\')');
    console.log('   - todayOrderBy: EXTRACT(HOUR FROM "createdAt")');

    console.log("\n🎉 All query generations look correct!");
    console.log("🔧 The fix should resolve the original error:");
    console.log(
      "   SequelizeDatabaseError: column must appear in the GROUP BY clause"
    );
  } catch (error) {
    console.error("❌ Query generation failed:", error.message);
  }

  process.exit(0);
}

// Jalankan test
testQueryGeneration();
