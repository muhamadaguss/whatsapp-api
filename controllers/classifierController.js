const MessageTypeClassifier = require("../utils/messageTypeClassifier");
const { asyncHandler } = require("../middleware/errorHandler");

/**
 * Test message classification
 */
const testClassification = asyncHandler(async (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({
      status: "error",
      message: "Message content is required",
    });
  }

  const classifier = new MessageTypeClassifier();
  const result = classifier.classifyWithDetails(message);

  return res.status(200).json({
    status: "success",
    data: {
      originalMessage: message,
      classification: result,
    },
  });
});

/**
 * Batch test multiple messages
 */
const batchTestClassification = asyncHandler(async (req, res) => {
  const { messages } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({
      status: "error",
      message: "Messages array is required",
    });
  }

  const classifier = new MessageTypeClassifier();
  const results = messages.map((message) => ({
    message,
    classification: classifier.classifyWithDetails(message),
  }));

  // Summary statistics
  const summary = {
    total: results.length,
    byCategory: {},
  };

  results.forEach((result) => {
    const category = result.classification.category;
    summary.byCategory[category] = (summary.byCategory[category] || 0) + 1;
  });

  return res.status(200).json({
    status: "success",
    data: {
      results,
      summary,
    },
  });
});

/**
 * Get classifier configuration
 */
const getClassifierConfig = asyncHandler(async (req, res) => {
  const classifier = new MessageTypeClassifier();

  return res.status(200).json({
    status: "success",
    data: {
      categories: Object.keys(classifier.categories),
      config: Object.entries(classifier.categories).reduce(
        (acc, [category, config]) => {
          acc[category] = {
            keywordCount: config.keywords.length,
            patternCount: config.patterns.length,
            sampleKeywords: config.keywords.slice(0, 5), // Show first 5 keywords
            samplePatterns: config.patterns
              .slice(0, 3)
              .map((p) => p.toString()), // Show first 3 patterns
          };
          return acc;
        },
        {}
      ),
    },
  });
});

module.exports = {
  testClassification,
  batchTestClassification,
  getClassifierConfig,
};
