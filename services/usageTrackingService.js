/**
 * Usage Tracking Service
 * 
 * Tracks and records usage metrics for organizations.
 * Monitors messages sent, accounts created, storage used, etc.
 * Used for quota enforcement and billing.
 */

const { DataTypes, Op } = require("sequelize");
const sequelize = require("../models/db");
const logger = require("../utils/logger");

/**
 * UsageMetric Model (in-memory definition, can be moved to models/ if needed)
 * Stores usage data per organization per period
 */
const UsageMetric = sequelize.define(
  "UsageMetric",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    organizationId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "organizations",
        key: "id",
      },
    },
    metricType: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: "Type of metric: messages_sent, wa_accounts, storage_mb, api_calls, etc",
    },
    value: {
      type: DataTypes.BIGINT,
      allowNull: false,
      defaultValue: 0,
      comment: "Current value of the metric",
    },
    period: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: "Period identifier: YYYY-MM for monthly tracking",
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: "Additional metadata about usage",
    },
  },
  {
    tableName: "usage_metrics",
    timestamps: true,
    underscored: true, // Use snake_case for column names
    indexes: [
      {
        fields: ["organization_id", "metric_type", "period"],
        unique: true,
      },
      {
        fields: ["organization_id", "period"],
      },
      {
        fields: ["metric_type", "period"],
      },
    ],
  }
);

class UsageTrackingService {
  constructor() {
    this.metricTypes = {
      MESSAGES_SENT: "messages_sent",
      WA_ACCOUNTS: "wa_accounts",
      STORAGE_MB: "storage_mb",
      API_CALLS: "api_calls",
      TEMPLATES: "templates",
      BLAST_CAMPAIGNS: "blast_campaigns",
      USERS: "users",
    };
  }

  /**
   * Initialize the service (create table if not exists)
   */
  async initialize() {
    try {
      await UsageMetric.sync();
      logger.info("Usage tracking service initialized");
    } catch (error) {
      logger.error("Error initializing usage tracking service:", error);
      throw error;
    }
  }

  /**
   * Get current period (YYYY-MM format)
   */
  getCurrentPeriod() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  }

  /**
   * Get period for specific date
   */
  getPeriod(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  }

  /**
   * Increment usage metric
   */
  async incrementUsage(organizationId, metricType, incrementBy = 1, metadata = {}) {
    try {
      const period = this.getCurrentPeriod();

      // Use upsert to handle concurrent increments
      const [metric, created] = await UsageMetric.findOrCreate({
        where: {
          organizationId,
          metricType,
          period,
        },
        defaults: {
          organizationId,
          metricType,
          period,
          value: incrementBy,
          metadata,
        },
      });

      if (!created) {
        // If record exists, increment the value
        await metric.increment("value", { by: incrementBy });
        
        // Update metadata if provided
        if (Object.keys(metadata).length > 0) {
          await metric.update({
            metadata: {
              ...metric.metadata,
              ...metadata,
            },
          });
        }
      }

      // Reload to get updated value
      await metric.reload();

      logger.debug(
        `Usage incremented: ${organizationId} - ${metricType} by ${incrementBy} (total: ${metric.value})`
      );

      return metric;
    } catch (error) {
      logger.error("Error incrementing usage:", error);
      throw error;
    }
  }

  /**
   * Set usage metric to specific value (for absolute metrics like storage)
   */
  async setUsage(organizationId, metricType, value, metadata = {}) {
    try {
      const period = this.getCurrentPeriod();

      const [metric] = await UsageMetric.upsert({
        organizationId,
        metricType,
        period,
        value,
        metadata,
      });

      logger.debug(`Usage set: ${organizationId} - ${metricType} = ${value}`);

      return metric;
    } catch (error) {
      logger.error("Error setting usage:", error);
      throw error;
    }
  }

  /**
   * Get current usage for a specific metric
   */
  async getCurrentUsage(organizationId, metricType) {
    try {
      const period = this.getCurrentPeriod();

      const metric = await UsageMetric.findOne({
        where: {
          organizationId,
          metricType,
          period,
        },
      });

      return metric ? metric.value : 0;
    } catch (error) {
      logger.error("Error getting current usage:", error);
      throw error;
    }
  }

  /**
   * Get all current usage metrics for organization
   */
  async getAllCurrentUsage(organizationId) {
    try {
      const period = this.getCurrentPeriod();

      const metrics = await UsageMetric.findAll({
        where: {
          organizationId,
          period,
        },
      });

      // Convert to object map
      const usage = {};
      metrics.forEach((metric) => {
        usage[metric.metricType] = metric.value;
      });

      return usage;
    } catch (error) {
      logger.error("Error getting all current usage:", error);
      throw error;
    }
  }

  /**
   * Get usage history for a metric
   */
  async getUsageHistory(organizationId, metricType, startDate, endDate) {
    try {
      const startPeriod = this.getPeriod(startDate || new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)); // 6 months ago
      const endPeriod = this.getPeriod(endDate || new Date());

      const metrics = await UsageMetric.findAll({
        where: {
          organizationId,
          metricType,
          period: {
            [Op.between]: [startPeriod, endPeriod],
          },
        },
        order: [["period", "ASC"]],
      });

      return metrics;
    } catch (error) {
      logger.error("Error getting usage history:", error);
      throw error;
    }
  }

  /**
   * Get all usage for a specific period
   */
  async getUsageByPeriod(organizationId, period) {
    try {
      const metrics = await UsageMetric.findAll({
        where: {
          organizationId,
          period: period || this.getCurrentPeriod(),
        },
      });

      // Convert to object map
      const usage = {};
      metrics.forEach((metric) => {
        usage[metric.metricType] = metric.value;
      });

      return usage;
    } catch (error) {
      logger.error("Error getting usage by period:", error);
      throw error;
    }
  }

  /**
   * Reset usage for new period (called by cron job)
   */
  async resetMonthlyUsage() {
    try {
      const currentPeriod = this.getCurrentPeriod();
      
      // Get all organizations with usage in current period
      const organizations = await UsageMetric.findAll({
        where: { period: currentPeriod },
        attributes: ["organizationId"],
        group: ["organizationId"],
      });

      logger.info(
        `Monthly usage reset initiated for ${organizations.length} organizations (period: ${currentPeriod})`
      );

      // Note: We don't actually delete old records, they serve as historical data
      // New period will automatically create new records via findOrCreate
      
      return organizations.length;
    } catch (error) {
      logger.error("Error resetting monthly usage:", error);
      throw error;
    }
  }

  /**
   * Delete old usage data (cleanup - keep last 12 months)
   */
  async cleanupOldUsage(monthsToKeep = 12) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setMonth(cutoffDate.getMonth() - monthsToKeep);
      const cutoffPeriod = this.getPeriod(cutoffDate);

      const deletedCount = await UsageMetric.destroy({
        where: {
          period: {
            [Op.lt]: cutoffPeriod,
          },
        },
      });

      logger.info(
        `Cleaned up ${deletedCount} old usage records (older than ${cutoffPeriod})`
      );

      return deletedCount;
    } catch (error) {
      logger.error("Error cleaning up old usage:", error);
      throw error;
    }
  }

  /**
   * Get usage summary with comparison to quotas
   */
  async getUsageSummary(organizationId, quotas) {
    try {
      const currentUsage = await this.getAllCurrentUsage(organizationId);
      const period = this.getCurrentPeriod();

      const summary = {};

      // Compare each metric with its quota
      Object.keys(quotas).forEach((quotaKey) => {
        // Map quota keys to metric types
        let metricType;
        switch (quotaKey) {
          case "maxWhatsAppAccounts":
            metricType = this.metricTypes.WA_ACCOUNTS;
            break;
          case "maxMessagesPerMonth":
            metricType = this.metricTypes.MESSAGES_SENT;
            break;
          case "maxStorageGB":
            metricType = this.metricTypes.STORAGE_MB;
            break;
          case "maxTemplates":
            metricType = this.metricTypes.TEMPLATES;
            break;
          case "maxUsers":
            metricType = this.metricTypes.USERS;
            break;
          default:
            return;
        }

        const used = currentUsage[metricType] || 0;
        const limit = quotas[quotaKey];
        const percentage = limit > 0 ? (used / limit) * 100 : 0;

        summary[quotaKey] = {
          metricType,
          used,
          limit,
          percentage: Math.round(percentage * 100) / 100,
          remaining: Math.max(0, limit - used),
          isOverQuota: used > limit,
        };
      });

      return {
        period,
        summary,
      };
    } catch (error) {
      logger.error("Error getting usage summary:", error);
      throw error;
    }
  }

  /**
   * Track message sent
   */
  async trackMessageSent(organizationId, metadata = {}) {
    return this.incrementUsage(
      organizationId,
      this.metricTypes.MESSAGES_SENT,
      1,
      metadata
    );
  }

  /**
   * Track API call
   */
  async trackApiCall(organizationId, endpoint, metadata = {}) {
    return this.incrementUsage(
      organizationId,
      this.metricTypes.API_CALLS,
      1,
      { endpoint, ...metadata }
    );
  }

  /**
   * Update storage usage
   */
  async updateStorageUsage(organizationId, storageMB, metadata = {}) {
    return this.setUsage(
      organizationId,
      this.metricTypes.STORAGE_MB,
      storageMB,
      metadata
    );
  }

  /**
   * Track WhatsApp account count
   */
  async updateWhatsAppAccountCount(organizationId, count) {
    return this.setUsage(
      organizationId,
      this.metricTypes.WA_ACCOUNTS,
      count
    );
  }

  /**
   * Track template count
   */
  async updateTemplateCount(organizationId, count) {
    return this.setUsage(
      organizationId,
      this.metricTypes.TEMPLATES,
      count
    );
  }

  /**
   * Track user count
   */
  async updateUserCount(organizationId, count) {
    return this.setUsage(
      organizationId,
      this.metricTypes.USERS,
      count
    );
  }

  /**
   * Get usage metrics for dashboard
   */
  async getDashboardMetrics(organizationId, quotas) {
    try {
      const summary = await this.getUsageSummary(organizationId, quotas);
      
      // Get previous month for comparison
      const now = new Date();
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthPeriod = this.getPeriod(lastMonth);
      const lastMonthUsage = await this.getUsageByPeriod(organizationId, lastMonthPeriod);

      // Calculate trends
      const currentUsage = await this.getAllCurrentUsage(organizationId);
      
      const trends = {};
      Object.keys(currentUsage).forEach((metricType) => {
        const current = currentUsage[metricType] || 0;
        const previous = lastMonthUsage[metricType] || 0;
        const change = previous > 0 ? ((current - previous) / previous) * 100 : 0;
        
        trends[metricType] = {
          current,
          previous,
          change: Math.round(change * 100) / 100,
          direction: change > 0 ? "up" : change < 0 ? "down" : "stable",
        };
      });

      return {
        period: summary.period,
        summary: summary.summary,
        trends,
      };
    } catch (error) {
      logger.error("Error getting dashboard metrics:", error);
      throw error;
    }
  }
}

module.exports = new UsageTrackingService();
