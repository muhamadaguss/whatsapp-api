const sequelize = require("./models/db");
const Blast = require("./models/blastModel");

async function testDatabaseConnection() {
  try {
    console.log("🔌 Testing database connection...");
    await sequelize.authenticate();
    console.log("✅ Database connection successful");

    console.log("\n🧪 Testing PostgreSQL date functions...");

    // Test TO_CHAR function
    const testQuery = await sequelize.query(
      `
      SELECT 
        TO_CHAR(NOW(), 'HH24":00"') as hour_format,
        TO_CHAR(NOW(), 'Dy') as day_format,
        TO_CHAR(NOW(), '"Day "DD') as day_number_format,
        EXTRACT(HOUR FROM NOW()) as hour_extract,
        EXTRACT(DOW FROM NOW()) as dow_extract,
        EXTRACT(DAY FROM NOW()) as day_extract
    `,
      { type: sequelize.QueryTypes.SELECT }
    );

    console.log("✅ PostgreSQL date functions test result:", testQuery[0]);

    console.log("\n🧪 Testing Blast model query...");
    const blastCount = await Blast.count();
    console.log(`✅ Total Blast records: ${blastCount}`);

    if (blastCount > 0) {
      console.log("\n🧪 Testing actual chart query...");
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

      const groupByExpression = sequelize.fn(
        "TO_CHAR",
        sequelize.col("createdAt"),
        '"Day "DD'
      );
      const orderByExpression = sequelize.fn(
        "EXTRACT",
        sequelize.literal('DAY FROM "createdAt"')
      );

      const trends = await Blast.findAll({
        attributes: [
          [groupByExpression, "name"],
          [sequelize.fn("SUM", sequelize.col("sentCount")), "success"],
          [sequelize.fn("SUM", sequelize.col("failedCount")), "failed"],
          [sequelize.fn("SUM", sequelize.col("totalRecipients")), "total"],
        ],
        where: {
          createdAt: {
            [sequelize.Op.between]: [startDate, endDate],
          },
        },
        group: [groupByExpression],
        order: [[orderByExpression, "ASC"]],
        raw: true,
        limit: 5, // Limit untuk testing
      });

      console.log("✅ Chart query test result:", trends);
    }

    console.log("\n🎉 All tests passed! PostgreSQL compatibility confirmed.");
  } catch (error) {
    console.error("❌ Database test failed:", error.message);
    console.error("Full error:", error);
  } finally {
    await sequelize.close();
  }
}

testDatabaseConnection();
