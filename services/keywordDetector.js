const logger = require("../utils/logger");

/**
 * Keyword Detector Service
 * Detects category based on keywords in customer message
 */

class KeywordDetector {
  /**
   * Detect category from message text
   * @param {string} messageText - Customer message
   * @param {Array} rules - Array of AutoReplyRule objects
   * @returns {Object|null} - Matched rule or null
   */
  static detectCategory(messageText, rules) {
    if (!messageText || typeof messageText !== "string") {
      logger.warn("⚠️ Invalid message text for keyword detection");
      return null;
    }

    // Normalize message: lowercase & trim
    const normalizedMessage = messageText.toLowerCase().trim();

    logger.info(`🔍 Detecting category for message: "${normalizedMessage}"`);

    // Try to match with each rule (except DEFAULT)
    for (const rule of rules) {
      // Skip DEFAULT category (it's fallback)
      if (rule.category === "DEFAULT") continue;

      // Skip inactive rules
      if (!rule.isActive) continue;

      // Check if any keyword matches
      const matched = this.matchKeywords(normalizedMessage, rule.keywords);

      if (matched) {
        logger.info(
          `✅ Category detected: ${rule.category} (matched keyword: "${matched}")`
        );
        return rule;
      }
    }

    // No match found, return DEFAULT rule
    const defaultRule = rules.find(
      (r) => r.category === "DEFAULT" && r.isActive
    );

    if (defaultRule) {
      logger.info("📋 No specific match, using DEFAULT category");
      return defaultRule;
    }

    logger.warn("⚠️ No DEFAULT rule found, returning null");
    return null;
  }

  /**
   * Check if message contains any of the keywords
   * @param {string} message - Normalized message
   * @param {Array} keywords - Array of keywords
   * @returns {string|null} - Matched keyword or null
   */
  static matchKeywords(message, keywords) {
    if (!Array.isArray(keywords) || keywords.length === 0) {
      return null;
    }

    for (const keyword of keywords) {
      const normalizedKeyword = keyword.toLowerCase().trim();

      // Check if keyword exists in message
      if (message.includes(normalizedKeyword)) {
        return keyword; // Return original keyword (not normalized)
      }
    }

    return null;
  }

  /**
   * Get confidence score for detection (0-100)
   * Higher score = more confident match
   * @param {string} messageText - Customer message
   * @param {Object} rule - Matched rule
   * @returns {number} - Confidence score
   */
  static getConfidenceScore(messageText, rule) {
    if (!messageText || !rule) return 0;

    const normalizedMessage = messageText.toLowerCase().trim();
    let matchCount = 0;

    // Count how many keywords match
    for (const keyword of rule.keywords) {
      const normalizedKeyword = keyword.toLowerCase().trim();
      if (normalizedMessage.includes(normalizedKeyword)) {
        matchCount++;
      }
    }

    // Calculate confidence (more matches = higher confidence)
    const confidence = Math.min(100, (matchCount / rule.keywords.length) * 100);

    return Math.round(confidence);
  }
}

module.exports = KeywordDetector;
