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
  const campaigns = await Blast.findAll({
    where: {
      userId,
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
  const classifier = new MessageTypeClassifier();
  const messageTypes = {
    Promo: { success: 0, failed: 0, total: 0 },
    Updates: { success: 0, failed: 0, total: 0 },
    Reminder: { success: 0, failed: 0, total: 0 },
    Welcome: { success: 0, failed: 0, total: 0 },
    Support: { success: 0, failed: 0, total: 0 },
  };
  campaigns.forEach((campaign) => {
    const category = classifier.classify(campaign.messageTemplate);
    messageTypes[category].success += campaign.sentCount || 0;
    messageTypes[category].failed += campaign.failedCount || 0;
    messageTypes[category].total += campaign.totalRecipients || 0;
  });
  const performance = Object.entries(messageTypes).map(([name, data]) => {
    const total = data.total || 1; 
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
