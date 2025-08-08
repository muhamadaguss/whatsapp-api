const sequelize = require("./models/db");
const Blast = require("./models/blastModel");
const User = require("./models/userModel");
const { Op } = require("sequelize");

async function diagnoseHistoryCampaign() {
  try {
    console.log("🔍 Diagnosing historyCampaign API issue...\n");

    // Test database connection
    console.log("1. Testing database connection...");
    await sequelize.authenticate();
    console.log("✅ Database connection successful\n");

    // Check if tables exist
    console.log("2. Checking table existence...");
    const [blastExists] = await sequelize.query(
      "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'blasts')"
    );
    const [userExists] = await sequelize.query(
      "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'users')"
    );

    console.log(`Blasts table exists: ${blastExists[0].exists}`);
    console.log(`Users table exists: ${userExists[0].exists}\n`);

    // Check table structure
    console.log("3. Checking table structures...");
    const [blastColumns] = await sequelize.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'blasts'"
    );
    const [userColumns] = await sequelize.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'users'"
    );

    console.log("Blasts table columns:");
    blastColumns.forEach((col) =>
      console.log(`  - ${col.column_name}: ${col.data_type}`)
    );

    console.log("\nUsers table columns:");
    userColumns.forEach((col) =>
      console.log(`  - ${col.column_name}: ${col.data_type}`)
    );
    console.log();

    // Check for recent blast records
    console.log("4. Checking recent blast records...");
    const recentBlasts = await Blast.findAll({
      limit: 5,
      order: [["createdAt", "DESC"]],
      raw: true,
    });

    console.log(`Found ${recentBlasts.length} recent blast records:`);
    recentBlasts.forEach((blast, index) => {
      console.log(
        `  ${index + 1}. ID: ${blast.id}, User: ${blast.userId}, Status: ${
          blast.status
        }, Created: ${blast.createdAt}`
      );
    });
    console.log();

    // Test the actual historyCampaign query with a sample user
    console.log("5. Testing historyCampaign query...");

    // Get a sample user ID
    const sampleUser = await User.findOne({ raw: true });
    if (!sampleUser) {
      console.log("❌ No users found in database");
      return;
    }

    console.log(
      `Using sample user ID: ${sampleUser.id} (${sampleUser.username})`
    );

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999
    );

    console.log(
      `Date range: ${startOfMonth.toISOString()} to ${endOfMonth.toISOString()}`
    );

    try {
      const campaigns = await Blast.findAll({
        where: {
          userId: sampleUser.id,
          createdAt: {
            [Op.between]: [startOfMonth, endOfMonth],
          },
        },
        include: [
          {
            model: User,
            as: "user",
            attributes: ["id", "username", "role"],
          },
        ],
        order: [["createdAt", "DESC"]],
      });

      console.log(
        `✅ Query successful! Found ${campaigns.length} campaigns for this month`
      );

      if (campaigns.length > 0) {
        console.log("Sample campaign data:");
        const sample = campaigns[0].toJSON();
        console.log(JSON.stringify(sample, null, 2));
      }
    } catch (queryError) {
      console.log("❌ Query failed with error:");
      console.error(queryError);

      // Try simpler query without include
      console.log("\n6. Testing simpler query without include...");
      try {
        const simpleCampaigns = await Blast.findAll({
          where: {
            userId: sampleUser.id,
            createdAt: {
              [Op.between]: [startOfMonth, endOfMonth],
            },
          },
          order: [["createdAt", "DESC"]],
        });

        console.log(
          `✅ Simple query successful! Found ${simpleCampaigns.length} campaigns`
        );
      } catch (simpleError) {
        console.log("❌ Even simple query failed:");
        console.error(simpleError);
      }
    }

    // Check for foreign key constraints
    console.log("\n7. Checking foreign key constraints...");
    const [constraints] = await sequelize.query(`
      SELECT 
        tc.constraint_name, 
        tc.table_name, 
        kcu.column_name, 
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name 
      FROM 
        information_schema.table_constraints AS tc 
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
      WHERE constraint_type = 'FOREIGN KEY' 
        AND tc.table_name IN ('blasts', 'users');
    `);

    console.log("Foreign key constraints:");
    constraints.forEach((constraint) => {
      console.log(
        `  - ${constraint.table_name}.${constraint.column_name} -> ${constraint.foreign_table_name}.${constraint.foreign_column_name}`
      );
    });
  } catch (error) {
    console.error("❌ Diagnosis failed:", error);
  } finally {
    await sequelize.close();
  }
}

// Run diagnosis
diagnoseHistoryCampaign().catch(console.error);
