const SpinTextEngine = require("../utils/spinTextEngine");
const { asyncHandler, AppError } = require("../middleware/errorHandler");
const logger = require("../utils/logger");
const previewSpinText = asyncHandler(async (req, res) => {
  const { template, previewCount = 10 } = req.body;
  if (!template) {
    throw new AppError("Template is required", 400);
  }
  try {
    const sanitizedTemplate = SpinTextEngine.sanitizeTemplate(template);
    const preview = SpinTextEngine.previewVariations(
      sanitizedTemplate,
      parseInt(previewCount)
    );
    return res.status(200).json({
      status: "success",
      data: {
        ...preview,
        sanitizedTemplate,
      },
    });
  } catch (error) {
    logger.error("Error previewing spin text:", error);
    throw new AppError("Failed to preview spin text", 500);
  }
});
const validateSpinText = asyncHandler(async (req, res) => {
  const { template } = req.body;
  if (!template) {
    throw new AppError("Template is required", 400);
  }
  try {
    const sanitizedTemplate = SpinTextEngine.sanitizeTemplate(template);
    const hasSpinText = SpinTextEngine.hasSpinText(sanitizedTemplate);
    const estimatedVariations =
      SpinTextEngine.estimateVariations(sanitizedTemplate);
    let isValid = true;
    let errorMessage = null;
    try {
      SpinTextEngine.parseSpinText(sanitizedTemplate);
    } catch (error) {
      isValid = false;
      errorMessage = error.message;
    }
    return res.status(200).json({
      status: "success",
      data: {
        isValid,
        hasSpinText,
        estimatedVariations,
        errorMessage,
        sanitizedTemplate,
      },
    });
  } catch (error) {
    logger.error("Error validating spin text:", error);
    throw new AppError("Failed to validate spin text", 500);
  }
});
const generateVariations = asyncHandler(async (req, res) => {
  const { template, count = 10 } = req.body;
  if (!template) {
    throw new AppError("Template is required", 400);
  }
  const maxCount = 50; 
  const requestedCount = Math.min(parseInt(count), maxCount);
  try {
    const sanitizedTemplate = SpinTextEngine.sanitizeTemplate(template);
    const variations = SpinTextEngine.generateVariations(
      sanitizedTemplate,
      requestedCount
    );
    return res.status(200).json({
      status: "success",
      data: {
        template: sanitizedTemplate,
        requestedCount,
        generatedCount: variations.length,
        variations,
      },
    });
  } catch (error) {
    logger.error("Error generating spin text variations:", error);
    throw new AppError("Failed to generate variations", 500);
  }
});
module.exports = {
  previewSpinText,
  validateSpinText,
  generateVariations,
};
