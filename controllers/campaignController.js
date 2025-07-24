const { Op } = require('sequelize')
const Blast = require("../models/blastModel");
const User = require("../models/userModel");
const logger = require('../utils/logger');
const { asyncHandler, AppError } = require('../middleware/errorHandler');

const historyCampaign = asyncHandler(async (req, res) => {
  const userId = req.user.id

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1) // 1st day of current month
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999) // last day of current month

  const campaigns = await Blast.findAll({
    where: {
      userId,
      createdAt: {
        [Op.between]: [startOfMonth, endOfMonth] // Filter hanya yang bulan ini
      }
    },
    include: [{
      model: User,
      as: 'user',
      attributes: ['id', 'username', 'role'],
    }],
    order: [['createdAt', 'DESC']], // opsional: urutkan terbaru dulu
  })

  return res.status(200).json({
    status: 'success',
    campaigns,
  })
});

const getDataCampaign = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { period } = req.body;

  const now = new Date();
  let startDate, endDate;

  switch (period) {
    case 'today':
      startDate = new Date(now.setHours(0, 0, 0, 0));
      endDate = new Date(now.setHours(23, 59, 59, 999));
      break;
    case 'weekly': {
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
    case 'monthly':
    default:
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      break;
  }

  const campaigns = await Blast.findAll({
    where: {
      userId,
      createdAt: {
        [Op.between]: [startDate, endDate]
      }
    },
    include: [{
      model: User,
      as: 'user',
      attributes: ['id', 'username', 'role'],
    }],
    order: [['createdAt', 'DESC']],
  });

  return res.status(200).json({
    status: 'success',
    campaigns,
  });
})

module.exports = {
  historyCampaign,
  getDataCampaign
}
