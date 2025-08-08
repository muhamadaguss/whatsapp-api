const { Op } = require("sequelize");
const sequelize = require("../models/db");
const Blast = require("../models/blastModel");
const User = require("../models/userModel");
const logger = require("../utils/logger");
const { asyncHandler, AppError } = require("../middleware/errorHandler");
const MessageTypeClassifier = require("../utils/messageTypeClassifier");

const historyCampaign = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1); // 1st day of current month
  const endOfMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
    23,
    59,
    59,
    999
  ); // last day of current month

  const campaigns = await Blast.findAll({
    where: {
      userId,
      createdAt: {
        [Op.between]: [startOfMonth, endOfMonth], // Filter hanya yang bulan ini
      },
    },
    include: [
      {
        model: User,
        as: "user",
        attributes: ["id", "username", "role"],
      },
    ],
    order: [["createdAt", "DESC"]], // opsional: urutkan terbaru dulu
  });

  return res.status(200).json({
    status: "success",
    campaigns,
  });
});

const getDataCampaign = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { period } = req.body;

  const now = new Date();
  let startDate, endDate;

  switch (period) {
    case "today":
      startDate = new Date(now.setHours(0, 0, 0, 0));
      endDate = new Date(now.setHours(23, 59, 59, 999));
      break;
    case "weekly": {
      const day = now.getDay(); // 0 = Sunday, 1 = Monday, ...
      const diffToMonday = (day === 0 ? -6 : 1) - day;
      startDate = new Date(now);
      startDate.setDate(now.getDate() + diffToMonday);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);
      break;
    }
    case "monthly":
    default:
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        0,
        23,
        59,
        59,
        999
      );
      break;
  }

  const campaigns = await Blast.findAll({
    where: {
      userId,
      createdAt: {
        [Op.between]: [startDate, endDate],
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

  return res.status(200).json({
    status: "success",
    campaigns,
  });
});

const getMessageTrends = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { period } = req.body;

  const now = new Date();
  let startDate, endDate, groupByExpression, orderByExpression;

  switch (period) {
    case "today":
      startDate = new Date(now.setHours(0, 0, 0, 0));
      endDate = new Date(now.setHours(23, 59, 59, 999));
      // PostgreSQL: Extract hour and format as "HH:00"
      groupByExpression = sequelize.fn(
        "TO_CHAR",
        sequelize.col("createdAt"),
        'HH24":00"'
      );
      orderByExpression = sequelize.fn(
        "EXTRACT",
        sequelize.literal('HOUR FROM "createdAt"')
      );
      break;
    case "weekly": {
      const day = now.getDay();
      const diffToMonday = (day === 0 ? -6 : 1) - day;
      startDate = new Date(now);
      startDate.setDate(now.getDate() + diffToMonday);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);
      // PostgreSQL: Get day name (Mon, Tue, etc.)
      groupByExpression = sequelize.fn(
        "TO_CHAR",
        sequelize.col("createdAt"),
        "Dy"
      );
      orderByExpression = sequelize.fn(
        "EXTRACT",
        sequelize.literal('DOW FROM "createdAt"')
      );
      break;
    }
    case "monthly":
    default:
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        0,
        23,
        59,
        59,
        999
      );
      // PostgreSQL: Format as "Day DD"
      groupByExpression = sequelize.fn(
        "TO_CHAR",
        sequelize.col("createdAt"),
        '"Day "DD'
      );
      orderByExpression = sequelize.fn(
        "EXTRACT",
        sequelize.literal('DAY FROM "createdAt"')
      );
      break;
  }

  // Get aggregated data by time period
  const trends = await Blast.findAll({
    attributes: [
      [groupByExpression, "name"],
      [sequelize.fn("SUM", sequelize.col("sentCount")), "success"],
      [sequelize.fn("SUM", sequelize.col("failedCount")), "failed"],
      [sequelize.fn("SUM", sequelize.col("totalRecipients")), "total"],
    ],
    where: {
      userId,
      createdAt: {
        [Op.between]: [startDate, endDate],
      },
    },
    group: [groupByExpression, orderByExpression],
    order: [[orderByExpression, "ASC"]],
    raw: true,
  });

  // Fill missing time slots with zero values
  const filledTrends = [];
  if (period === "today") {
    for (let i = 0; i < 24; i++) {
      const hourLabel = `${i.toString().padStart(2, "0")}:00`;
      const existing = trends.find((t) => t.name === hourLabel);
      filledTrends.push({
        name: hourLabel,
        success: existing ? parseInt(existing.success) || 0 : 0,
        failed: existing ? parseInt(existing.failed) || 0 : 0,
        total: existing ? parseInt(existing.total) || 0 : 0,
      });
    }
  } else if (period === "weekly") {
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    days.forEach((day) => {
      const existing = trends.find((t) => t.name === day);
      filledTrends.push({
        name: day,
        success: existing ? parseInt(existing.success) || 0 : 0,
        failed: existing ? parseInt(existing.failed) || 0 : 0,
        total: existing ? parseInt(existing.total) || 0 : 0,
      });
    });
  } else {
    const daysInMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0
    ).getDate();
    for (let i = 1; i <= daysInMonth; i++) {
      const dayLabel = `Day ${i.toString().padStart(2, "0")}`;
      const existing = trends.find((t) => t.name === dayLabel);
      filledTrends.push({
        name: dayLabel,
        success: existing ? parseInt(existing.success) || 0 : 0,
        failed: existing ? parseInt(existing.failed) || 0 : 0,
        total: existing ? parseInt(existing.total) || 0 : 0,
      });
    }
  }

  return res.status(200).json({
    status: "success",
    trends: filledTrends,
  });
});

const getMessageTypePerformance = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { period } = req.body;

  const now = new Date();
  let startDate, endDate;

  switch (period) {
    case "today":
      startDate = new Date(now.setHours(0, 0, 0, 0));
      endDate = new Date(now.setHours(23, 59, 59, 999));
      break;
    case "weekly": {
      const day = now.getDay();
      const diffToMonday = (day === 0 ? -6 : 1) - day;
      startDate = new Date(now);
      startDate.setDate(now.getDate() + diffToMonday);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);
      break;
    }
    case "monthly":
    default:
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        0,
        23,
        59,
        59,
        999
      );
      break;
  }

  // Get campaigns and categorize by message content
  const campaigns = await Blast.findAll({
    where: {
      userId,
      createdAt: {
        [Op.between]: [startDate, endDate],
      },
    },
    attributes: [
      "messageTemplate",
      "sentCount",
      "failedCount",
      "totalRecipients",
    ],
    raw: true,
  });

  // Initialize message type classifier
  const classifier = new MessageTypeClassifier();

  // Categorize messages by type using advanced classifier
  const messageTypes = {
    Promo: { success: 0, failed: 0, total: 0 },
    Updates: { success: 0, failed: 0, total: 0 },
    Reminder: { success: 0, failed: 0, total: 0 },
    Welcome: { success: 0, failed: 0, total: 0 },
    Support: { success: 0, failed: 0, total: 0 },
  };

  campaigns.forEach((campaign) => {
    // Use advanced classifier instead of simple keyword matching
    const category = classifier.classify(campaign.messageTemplate);

    messageTypes[category].success += campaign.sentCount || 0;
    messageTypes[category].failed += campaign.failedCount || 0;
    messageTypes[category].total += campaign.totalRecipients || 0;
  });

  // Convert to array format and calculate percentages
  const performance = Object.entries(messageTypes).map(([name, data]) => {
    const total = data.total || 1; // Avoid division by zero
    return {
      name,
      success: Math.round((data.success / total) * 100),
      failed: Math.round((data.failed / total) * 100),
      totalMessages: data.total,
    };
  });

  return res.status(200).json({
    status: "success",
    performance,
  });
});

module.exports = {
  historyCampaign,
  getDataCampaign,
  getMessageTrends,
  getMessageTypePerformance,
};
