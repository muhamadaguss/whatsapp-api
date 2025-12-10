const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/authMiddleware");
const AutoReplyRule = require("../models/autoReplyRuleModel");
const AutoReplyLog = require("../models/autoReplyLogModel");
const AutoReplyService = require("../services/autoReplyService");
const logger = require("../utils/logger");

/**
 * GET /auto-reply/rules
 * Get all auto-reply rules
 */
router.get("/rules", verifyToken, async (req, res) => {
  try {
    const rules = await AutoReplyRule.findAll({
      order: [["category", "ASC"]],
      attributes: [
        "id",
        "category",
        "keywords",
        "responseTemplate",
        "notifyCollector",
        "isActive",
        "createdAt",
        "updatedAt",
      ],
    });

    res.status(200).json({
      success: true,
      data: rules,
      count: rules.length,
    });
  } catch (error) {
    logger.error("❌ Error fetching auto-reply rules:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch auto-reply rules",
      error: error.message,
    });
  }
});

/**
 * GET /auto-reply/rules/:id
 * Get single auto-reply rule by ID
 */
router.get("/rules/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const rule = await AutoReplyRule.findByPk(id);

    if (!rule) {
      return res.status(404).json({
        success: false,
        message: "Auto-reply rule not found",
      });
    }

    res.status(200).json({
      success: true,
      data: rule,
    });
  } catch (error) {
    logger.error("❌ Error fetching auto-reply rule:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch auto-reply rule",
      error: error.message,
    });
  }
});

/**
 * POST /auto-reply/rules
 * Create new auto-reply rule
 */
router.post("/rules", verifyToken, async (req, res) => {
  try {
    const { category, keywords, responseTemplate, notifyCollector, isActive } =
      req.body;

    // Validation
    if (!category || !keywords || !responseTemplate) {
      return res.status(400).json({
        success: false,
        message:
          "Missing required fields: category, keywords, responseTemplate",
      });
    }

    if (!Array.isArray(keywords) || keywords.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Keywords must be a non-empty array",
      });
    }

    const rule = await AutoReplyRule.create({
      category,
      keywords,
      responseTemplate,
      notifyCollector: notifyCollector || false,
      isActive: isActive !== undefined ? isActive : true,
      createdBy: req.user.id,
    });

    logger.info(
      `✅ Auto-reply rule created: ${category} by user ${req.user.id}`
    );

    res.status(201).json({
      success: true,
      message: "Auto-reply rule created successfully",
      data: rule,
    });
  } catch (error) {
    logger.error("❌ Error creating auto-reply rule:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create auto-reply rule",
      error: error.message,
    });
  }
});

/**
 * PUT /auto-reply/rules/:id
 * Update auto-reply rule
 */
router.put("/rules/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { category, keywords, responseTemplate, notifyCollector, isActive } =
      req.body;

    const rule = await AutoReplyRule.findByPk(id);

    if (!rule) {
      return res.status(404).json({
        success: false,
        message: "Auto-reply rule not found",
      });
    }

    // Update fields
    if (category) rule.category = category;
    if (keywords) {
      if (!Array.isArray(keywords) || keywords.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Keywords must be a non-empty array",
        });
      }
      rule.keywords = keywords;
    }
    if (responseTemplate) rule.responseTemplate = responseTemplate;
    if (notifyCollector !== undefined) rule.notifyCollector = notifyCollector;
    if (isActive !== undefined) rule.isActive = isActive;

    await rule.save();

    logger.info(`✅ Auto-reply rule updated: ${id} by user ${req.user.id}`);

    res.status(200).json({
      success: true,
      message: "Auto-reply rule updated successfully",
      data: rule,
    });
  } catch (error) {
    logger.error("❌ Error updating auto-reply rule:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update auto-reply rule",
      error: error.message,
    });
  }
});

/**
 * DELETE /auto-reply/rules/:id
 * Delete auto-reply rule
 */
router.delete("/rules/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const rule = await AutoReplyRule.findByPk(id);

    if (!rule) {
      return res.status(404).json({
        success: false,
        message: "Auto-reply rule not found",
      });
    }

    await rule.destroy();

    logger.info(`✅ Auto-reply rule deleted: ${id} by user ${req.user.id}`);

    res.status(200).json({
      success: true,
      message: "Auto-reply rule deleted successfully",
    });
  } catch (error) {
    logger.error("❌ Error deleting auto-reply rule:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete auto-reply rule",
      error: error.message,
    });
  }
});

/**
 * GET /auto-reply/logs
 * Get auto-reply logs with pagination and filters
 */
router.get("/logs", verifyToken, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      category,
      blastId,
      customerPhone,
    } = req.query;

    const offset = (page - 1) * limit;
    const where = {};

    if (category) where.detectedCategory = category;
    if (blastId) where.blastId = blastId;
    if (customerPhone) where.customerPhone = customerPhone;

    const { count, rows } = await AutoReplyLog.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [["repliedAt", "DESC"]],
    });

    res.status(200).json({
      success: true,
      data: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    logger.error("❌ Error fetching auto-reply logs:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch auto-reply logs",
      error: error.message,
    });
  }
});

/**
 * GET /auto-reply/logs/:blastId
 * Get auto-reply logs for specific blast
 */
router.get("/logs/:blastId", verifyToken, async (req, res) => {
  try {
    const { blastId } = req.params;

    const logs = await AutoReplyLog.findAll({
      where: { blastId },
      order: [["repliedAt", "DESC"]],
    });

    res.status(200).json({
      success: true,
      data: logs,
      count: logs.length,
    });
  } catch (error) {
    logger.error("❌ Error fetching blast auto-reply logs:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch blast auto-reply logs",
      error: error.message,
    });
  }
});

/**
 * GET /auto-reply/stats
 * Get auto-reply statistics
 */
router.get("/stats", verifyToken, async (req, res) => {
  try {
    const { blastId } = req.query;

    const stats = await AutoReplyService.getStatistics(
      blastId ? parseInt(blastId) : null
    );

    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error("❌ Error fetching auto-reply stats:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch auto-reply statistics",
      error: error.message,
    });
  }
});

/**
 * GET /auto-reply/stats/:blastId
 * Get auto-reply statistics for specific blast
 */
router.get("/stats/:blastId", verifyToken, async (req, res) => {
  try {
    const { blastId } = req.params;

    const stats = await AutoReplyService.getStatistics(parseInt(blastId));

    res.status(200).json({
      success: true,
      data: stats,
      blastId: parseInt(blastId),
    });
  } catch (error) {
    logger.error("❌ Error fetching blast auto-reply stats:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch blast auto-reply statistics",
      error: error.message,
    });
  }
});

module.exports = router;
