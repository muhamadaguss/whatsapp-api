const Template = require("../models/templateModel");
const { Op } = require("sequelize");
const logger = require("../utils/logger");
const { asyncHandler, AppError } = require("../middleware/errorHandler");
const SpinTextEngine = require("../utils/spinTextEngine");
const usageTrackingService = require("../services/usageTrackingService");

const getTemplates = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const templates = await Template.findAll({
    where: { userId },
    order: [["createdAt", "DESC"]],
  });

  // Add spin text info to each template
  const templatesWithSpinInfo = templates.map((template) => {
    const hasSpinText = SpinTextEngine.hasSpinText(template.content);
    const estimatedVariations = SpinTextEngine.estimateVariations(
      template.content
    );

    return {
      ...template.toJSON(),
      spinTextInfo: {
        hasSpinText,
        estimatedVariations,
      },
    };
  });

  res.status(200).json(templatesWithSpinInfo);
});

const createTemplate = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { name, content, type } = req.body;

  if (!name || !content) {
    throw new AppError("Name and content are required", 400);
  }

  // Sanitize content untuk security
  const sanitizedContent = SpinTextEngine.sanitizeTemplate(content);

  // Check if template has spin text
  const hasSpinText = SpinTextEngine.hasSpinText(sanitizedContent);
  const estimatedVariations =
    SpinTextEngine.estimateVariations(sanitizedContent);

  const newTemplate = await Template.create({
    userId,
    name,
    content: sanitizedContent,
    type: type || "text", // Default to 'text' if not provided
  });

  // Add spin text info to response
  const response = {
    ...newTemplate.toJSON(),
    spinTextInfo: {
      hasSpinText,
      estimatedVariations,
    },
  };

  // Update template count for quota tracking
  try {
    if (req.tenant?.organizationId) {
      const totalTemplates = await Template.count({
        where: { organizationId: req.tenant.organizationId },
      });
      await usageTrackingService.updateTemplateCount(
        req.tenant.organizationId,
        totalTemplates
      );
      logger.info(
        `📊 Template count updated: ${totalTemplates} for organization ${req.tenant.organizationId}`
      );
    }
  } catch (trackingError) {
    logger.error(`❌ Failed to update template count:`, trackingError);
    // Don't throw error, response still success
  }

  res.status(201).json(response);
});

const updateTemplate = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { id, name, content, type } = req.body;

  if (!id || !name || !content) {
    throw new AppError("ID, name, and content are required", 400);
  }

  const template = await Template.findOne({
    where: {
      id,
      userId,
    },
  });

  if (!template) {
    throw new AppError("Template not found", 404);
  }

  // Sanitize content untuk security
  const sanitizedContent = SpinTextEngine.sanitizeTemplate(content);

  // Check if template has spin text
  const hasSpinText = SpinTextEngine.hasSpinText(sanitizedContent);
  const estimatedVariations =
    SpinTextEngine.estimateVariations(sanitizedContent);

  template.name = name;
  template.content = sanitizedContent;
  template.type = type || "text"; // Default to 'text' if not provided
  await template.save();

  // Add spin text info to response
  const response = {
    ...template.toJSON(),
    spinTextInfo: {
      hasSpinText,
      estimatedVariations,
    },
  };

  res.status(200).json(response);
});
const deleteTemplate = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { id } = req.body;

  if (!id) {
    throw new AppError("ID is required", 400);
  }

  const template = await Template.findOne({
    where: {
      id,
      userId,
    },
  });

  if (!template) {
    throw new AppError("Template not found", 404);
  }

  await template.destroy();

  // Update template count for quota tracking
  try {
    if (req.tenant?.organizationId) {
      const totalTemplates = await Template.count({
        where: { organizationId: req.tenant.organizationId },
      });
      await usageTrackingService.updateTemplateCount(
        req.tenant.organizationId,
        totalTemplates
      );
      logger.info(
        `📊 Template count updated: ${totalTemplates} for organization ${req.tenant.organizationId}`
      );
    }
  } catch (trackingError) {
    logger.error(`❌ Failed to update template count:`, trackingError);
    // Don't throw error, response still success
  }

  res.status(200).json({ message: "Template deleted successfully" });
});

module.exports = {
  getTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
};
