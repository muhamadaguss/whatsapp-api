const AutoReplyRule = require("../models/autoReplyRuleModel");
const AutoReplyLog = require("../models/autoReplyLogModel");
const BlastMessage = require("../models/blastMessageModel");
const KeywordDetector = require("./keywordDetector");
const { generateRandomDelay, sleep } = require("../utils/responseDelay");
const { getSocket } = require("../auth/socket");
const logger = require("../utils/logger");

/**
 * Auto-Reply Service
 * Core logic for handling automatic replies to customer messages
 */

class AutoReplyService {
  /**
   * Check if customer has already received auto-reply
   * @param {string} customerPhone - Customer phone number
   * @param {number} blastId - Blast campaign ID (optional)
   * @returns {Promise<boolean>} - True if already replied
   */
  static async hasAlreadyReplied(customerPhone, blastId = null) {
    try {
      const where = { customerPhone };

      // If blastId provided, check for that specific blast
      if (blastId) {
        where.blastId = blastId;
      }

      // Check if log exists (within last 24 hours to be safe)
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      where.createdAt = { [require("sequelize").Op.gte]: oneDayAgo };

      const existingLog = await AutoReplyLog.findOne({ where });

      return !!existingLog;
    } catch (error) {
      logger.error("❌ Error checking reply status:", error);
      return false; // On error, allow reply (fail-safe)
    }
  }

  /**
   * Get customer data from blast message
   * @param {string} customerPhone - Customer phone number
   * @returns {Promise<Object|null>} - Customer data or null
   */
  static async getCustomerData(customerPhone) {
    try {
      // Clean phone number (remove @s.whatsapp.net if exists)
      const cleanPhone = customerPhone.replace("@s.whatsapp.net", "");

      // Find blast message for this customer
      const blastMessage = await BlastMessage.findOne({
        where: { phone: cleanPhone },
        order: [["createdAt", "DESC"]], // Get most recent
      });

      if (blastMessage) {
        return {
          phone: blastMessage.phone,
          name: blastMessage.contactName || "Bapak/Ibu",
          blastId: blastMessage.sessionId,
          variables: blastMessage.variables || {},
        };
      }

      // Fallback if not found in blast
      return {
        phone: cleanPhone,
        name: "Bapak/Ibu",
        blastId: null,
        variables: {},
      };
    } catch (error) {
      logger.error("❌ Error getting customer data:", error);
      return {
        phone: customerPhone,
        name: "Bapak/Ibu",
        blastId: null,
        variables: {},
      };
    }
  }

  /**
   * Send auto-reply to customer
   * @param {Object} sock - WhatsApp socket connection
   * @param {string} customerPhone - Customer phone number (with @s.whatsapp.net)
   * @param {string} messageText - Customer's message
   * @param {string} sessionId - WhatsApp session ID
   * @returns {Promise<Object>} - Result object
   */
  static async handleIncomingMessage(
    sock,
    customerPhone,
    messageText,
    sessionId
  ) {
    try {
      logger.info(
        `📨 Auto-reply handler triggered for ${customerPhone}: "${messageText}"`
      );

      // 1. Check if already replied (max 1 reply per customer)
      const alreadyReplied = await this.hasAlreadyReplied(customerPhone);
      if (alreadyReplied) {
        logger.info(
          `⏭️  Customer ${customerPhone} already received auto-reply. Skipping.`
        );
        return {
          success: false,
          reason: "already_replied",
          message: "Customer already received auto-reply",
        };
      }

      // 2. Get customer data
      const customerData = await this.getCustomerData(customerPhone);

      // 3. Load all active rules
      const rules = await AutoReplyRule.findAll({
        where: { isActive: true },
        order: [["category", "ASC"]],
      });

      if (rules.length === 0) {
        logger.warn("⚠️ No active auto-reply rules found");
        return {
          success: false,
          reason: "no_rules",
          message: "No active rules configured",
        };
      }

      // 4. Detect category
      const matchedRule = KeywordDetector.detectCategory(messageText, rules);

      if (!matchedRule) {
        logger.warn("⚠️ No matching rule found for message");
        return {
          success: false,
          reason: "no_match",
          message: "No matching rule found",
        };
      }

      // 5. Generate random delay (2-5 seconds)
      const delay = generateRandomDelay(2, 5);
      logger.info(`⏱️  Waiting ${delay} seconds before replying...`);
      await sleep(delay);

      // 6. Get response template (no variable replacement needed)
      const response = matchedRule.responseTemplate;

      // 7. Send message via WhatsApp
      await sock.sendMessage(customerPhone, { text: response });
      logger.info(`✅ Auto-reply sent to ${customerPhone}`);

      // 8. Log the interaction
      const log = await AutoReplyLog.create({
        blastId: customerData.blastId,
        customerPhone: customerData.phone,
        customerName: customerData.name,
        customerMessage: messageText,
        detectedCategory: matchedRule.category,
        botResponse: response,
        responseDelay: delay,
        repliedAt: new Date(),
        notifiedCollector: matchedRule.notifyCollector,
      });

      // 9. Notify collector if needed
      if (matchedRule.notifyCollector) {
        await this.notifyCollector({
          logId: log.id,
          category: matchedRule.category,
          customerName: customerData.name,
          customerPhone: customerData.phone,
          customerMessage: messageText,
          priority: matchedRule.category === "COMPLAINT" ? "HIGH" : "MEDIUM",
        });
      }

      return {
        success: true,
        category: matchedRule.category,
        delay,
        notified: matchedRule.notifyCollector,
        logId: log.id,
      };
    } catch (error) {
      logger.error("❌ Error in auto-reply handler:", error);
      return {
        success: false,
        reason: "error",
        message: error.message,
      };
    }
  }

  /**
   * Notify collector via Socket.io
   * @param {Object} data - Notification data
   */
  static async notifyCollector(data) {
    try {
      const io = getSocket();

      const notification = {
        id: data.logId,
        type: "AUTO_REPLY_ALERT",
        priority: data.priority,
        customer: {
          name: data.customerName,
          phone: data.customerPhone,
        },
        message: data.customerMessage,
        category: data.category,
        timestamp: new Date(),
        actionRequired: true,
      };

      // Emit to all connected collectors
      io.emit("auto_reply_notification", notification);

      logger.info(
        `🔔 Notified collectors about ${data.category} from ${data.customerPhone}`
      );
    } catch (error) {
      logger.error("❌ Error notifying collector:", error);
      // Don't throw - notification failure shouldn't break auto-reply
    }
  }

  /**
   * Get auto-reply statistics
   * @param {number} blastId - Blast campaign ID (optional)
   * @returns {Promise<Object>} - Statistics object
   */
  static async getStatistics(blastId = null) {
    try {
      const where = {};
      if (blastId) {
        where.blastId = blastId;
      }

      const total = await AutoReplyLog.count({ where });

      // Count by category
      const { Op } = require("sequelize");
      const categories = await AutoReplyLog.findAll({
        where,
        attributes: [
          "detectedCategory",
          [
            require("../models/db").fn(
              "COUNT",
              require("../models/db").col("id")
            ),
            "count",
          ],
        ],
        group: ["detectedCategory"],
        raw: true,
      });

      const byCategory = {};
      categories.forEach((cat) => {
        byCategory[cat.detectedCategory] = parseInt(cat.count);
      });

      // Count notified
      const notifiedCount = await AutoReplyLog.count({
        where: { ...where, notifiedCollector: true },
      });

      return {
        total,
        byCategory,
        notifiedCount,
        responseRate: total > 0 ? 100 : 0, // Can be enhanced with blast data
      };
    } catch (error) {
      logger.error("❌ Error getting statistics:", error);
      return {
        total: 0,
        byCategory: {},
        notifiedCount: 0,
        responseRate: 0,
      };
    }
  }
}

module.exports = AutoReplyService;
