/**
 * Quota Service
 * 
 * Enforces subscription quotas and limits.
 * Checks usage against plan limits and sends alerts.
 * Provides middleware for quota checking before actions.
 */

const subscriptionService = require("./subscriptionService");
const usageTrackingService = require("./usageTrackingService");
const logger = require("../utils/logger");

class QuotaService {
  constructor() {
    this.alertThresholds = {
      WARNING: 80, // 80% usage
      CRITICAL: 95, // 95% usage
      EXCEEDED: 100, // 100% usage
    };

    // Grace period after exceeding quota (in days)
    this.gracePeriodDays = 7;
  }

  /**
   * Check if organization has quota for specific metric
   */
  async checkQuota(organizationId, metricType, requiredAmount = 1) {
    try {
      // Get organization's quotas based on subscription plan
      const quotas = await subscriptionService.getOrganizationQuotas(organizationId);

      // Map metric type to quota key
      const quotaKey = this._mapMetricToQuotaKey(metricType);

      if (!quotaKey || !quotas[quotaKey]) {
        // No quota defined for this metric, allow by default
        return {
          allowed: true,
          hasQuota: false,
          message: "No quota limit for this metric",
        };
      }

      const limit = quotas[quotaKey];

      // Get current usage
      const currentUsage = await usageTrackingService.getCurrentUsage(
        organizationId,
        metricType
      );

      const remaining = limit - currentUsage;
      const wouldExceed = currentUsage + requiredAmount > limit;

      if (wouldExceed) {
        // Check if in grace period
        const inGracePeriod = await this._checkGracePeriod(organizationId, metricType);

        if (inGracePeriod) {
          logger.warn(
            `Quota exceeded but in grace period: ${organizationId} - ${metricType}`
          );

          return {
            allowed: true,
            hasQuota: true,
            inGracePeriod: true,
            currentUsage,
            limit,
            remaining,
            message: `Quota exceeded. Grace period active until grace period ends.`,
          };
        }

        logger.warn(
          `Quota exceeded: ${organizationId} - ${metricType} (${currentUsage}/${limit})`
        );

        return {
          allowed: false,
          hasQuota: true,
          currentUsage,
          limit,
          remaining,
          message: `Quota limit reached. Current usage: ${currentUsage}/${limit}. Please upgrade your plan.`,
        };
      }

      // Calculate percentage
      const percentage = (currentUsage / limit) * 100;

      // Check if we should send alerts
      if (percentage >= this.alertThresholds.WARNING) {
        await this._createQuotaAlert(organizationId, metricType, percentage);
      }

      return {
        allowed: true,
        hasQuota: true,
        currentUsage,
        limit,
        remaining,
        percentage: Math.round(percentage * 100) / 100,
        message: "Within quota limits",
      };
    } catch (error) {
      logger.error("Error checking quota:", error);
      // On error, allow by default to prevent blocking operations
      return {
        allowed: true,
        hasQuota: false,
        error: error.message,
        message: "Error checking quota, allowing by default",
      };
    }
  }

  /**
   * Check multiple quotas at once
   */
  async checkMultipleQuotas(organizationId, checks) {
    try {
      const results = await Promise.all(
        checks.map(({ metricType, requiredAmount }) =>
          this.checkQuota(organizationId, metricType, requiredAmount)
        )
      );

      const allAllowed = results.every((result) => result.allowed);

      return {
        allowed: allAllowed,
        checks: results,
        message: allAllowed
          ? "All quotas within limits"
          : "One or more quotas exceeded",
      };
    } catch (error) {
      logger.error("Error checking multiple quotas:", error);
      throw error;
    }
  }

  /**
   * Middleware to check quota before action
   * Usage: quotaService.requireQuota('messages_sent', 1)
   */
  requireQuota(metricType, requiredAmount = 1) {
    return async (req, res, next) => {
      try {
        const { organizationId } = req.tenant;

        if (!organizationId) {
          return res.status(400).json({
            success: false,
            message: "Organization context required",
          });
        }

        const quotaCheck = await this.checkQuota(
          organizationId,
          metricType,
          requiredAmount
        );

        if (!quotaCheck.allowed) {
          return res.status(403).json({
            success: false,
            message: quotaCheck.message,
            quotaInfo: {
              currentUsage: quotaCheck.currentUsage,
              limit: quotaCheck.limit,
              remaining: quotaCheck.remaining,
            },
          });
        }

        // Attach quota info to request for use in controller
        req.quotaCheck = quotaCheck;

        next();
      } catch (error) {
        logger.error("Error in quota middleware:", error);
        // On error, allow by default
        next();
      }
    };
  }

  /**
   * Middleware to check feature access
   * Usage: quotaService.requireFeature('aiClassifier')
   */
  requireFeature(featureName) {
    return async (req, res, next) => {
      try {
        const { organizationId } = req.tenant;

        if (!organizationId) {
          return res.status(400).json({
            success: false,
            message: "Organization context required",
          });
        }

        const hasFeature = await subscriptionService.hasFeature(
          organizationId,
          featureName
        );

        if (!hasFeature) {
          return res.status(403).json({
            success: false,
            message: `This feature is not available in your current plan. Please upgrade to access ${featureName}.`,
            featureName,
          });
        }

        next();
      } catch (error) {
        logger.error("Error in feature middleware:", error);
        // On error, allow by default
        next();
      }
    };
  }

  /**
   * Get quota status for all metrics
   */
  async getQuotaStatus(organizationId) {
    try {
      const quotas = await subscriptionService.getOrganizationQuotas(organizationId);
      const usageSummary = await usageTrackingService.getUsageSummary(
        organizationId,
        quotas
      );

      const status = {};

      Object.keys(usageSummary.summary).forEach((quotaKey) => {
        const data = usageSummary.summary[quotaKey];
        
        let statusLevel = "ok";
        if (data.percentage >= this.alertThresholds.EXCEEDED) {
          statusLevel = "exceeded";
        } else if (data.percentage >= this.alertThresholds.CRITICAL) {
          statusLevel = "critical";
        } else if (data.percentage >= this.alertThresholds.WARNING) {
          statusLevel = "warning";
        }

        status[quotaKey] = {
          ...data,
          statusLevel,
        };
      });

      return {
        period: usageSummary.period,
        status,
      };
    } catch (error) {
      logger.error("Error getting quota status:", error);
      throw error;
    }
  }

  /**
   * Map metric type to quota key
   */
  _mapMetricToQuotaKey(metricType) {
    const mapping = {
      messages_sent: "maxMessagesPerMonth",
      wa_accounts: "maxWhatsAppAccounts",
      storage_mb: "maxStorageGB",
      templates: "maxTemplates",
      users: "maxUsers",
      blast_campaigns: "maxBlastCampaigns",
      api_calls: "maxApiCallsPerMonth",
    };

    return mapping[metricType];
  }

  /**
   * Check if organization is in grace period
   */
  async _checkGracePeriod(organizationId, metricType) {
    try {
      // Get subscription to check if it's a paying customer
      const subscription = await subscriptionService.getCurrentSubscription(
        organizationId
      );

      if (!subscription) {
        return false;
      }

      // Free plan gets no grace period
      if (subscription.plan.name === "free") {
        return false;
      }

      // Check metadata for grace period start
      const gracePeriodStart =
        subscription.metadata?.gracePeriod?.[metricType]?.startDate;

      if (!gracePeriodStart) {
        // First time exceeding, set grace period
        await subscription.update({
          metadata: {
            ...subscription.metadata,
            gracePeriod: {
              ...subscription.metadata?.gracePeriod,
              [metricType]: {
                startDate: new Date(),
                notified: false,
              },
            },
          },
        });

        return true;
      }

      // Check if grace period expired
      const gracePeriodEnd = new Date(gracePeriodStart);
      gracePeriodEnd.setDate(gracePeriodEnd.getDate() + this.gracePeriodDays);

      return new Date() < gracePeriodEnd;
    } catch (error) {
      logger.error("Error checking grace period:", error);
      return false;
    }
  }

  /**
   * Create quota alert
   */
  async _createQuotaAlert(organizationId, metricType, percentage) {
    try {
      // Determine alert level
      let alertLevel;
      if (percentage >= this.alertThresholds.EXCEEDED) {
        alertLevel = "EXCEEDED";
      } else if (percentage >= this.alertThresholds.CRITICAL) {
        alertLevel = "CRITICAL";
      } else if (percentage >= this.alertThresholds.WARNING) {
        alertLevel = "WARNING";
      } else {
        return; // No alert needed
      }

      // Get subscription to check if alert was already sent
      const subscription = await subscriptionService.getCurrentSubscription(
        organizationId
      );

      if (!subscription) {
        return;
      }

      const lastAlert =
        subscription.metadata?.quotaAlerts?.[metricType]?.[alertLevel];

      // Only send alert once per level per period
      const period = usageTrackingService.getCurrentPeriod();
      if (lastAlert?.period === period && lastAlert?.sent) {
        return;
      }

      // Update subscription metadata with alert info
      await subscription.update({
        metadata: {
          ...subscription.metadata,
          quotaAlerts: {
            ...subscription.metadata?.quotaAlerts,
            [metricType]: {
              ...subscription.metadata?.quotaAlerts?.[metricType],
              [alertLevel]: {
                percentage,
                period,
                sent: true,
                timestamp: new Date(),
              },
            },
          },
        },
      });

      logger.info(
        `Quota alert created: ${organizationId} - ${metricType} - ${alertLevel} (${percentage}%)`
      );

      // TODO: Send actual notification (email, webhook, etc.)
      // This would integrate with a notification service

      return {
        organizationId,
        metricType,
        alertLevel,
        percentage,
      };
    } catch (error) {
      logger.error("Error creating quota alert:", error);
    }
  }

  /**
   * Manually trigger quota check for all organizations (cron job)
   */
  async checkAllOrganizationQuotas() {
    try {
      const Organization = require("../models/organizationModel");
      const organizations = await Organization.findAll({
        where: { status: "active" },
      });

      const results = await Promise.all(
        organizations.map(async (org) => {
          try {
            const quotaStatus = await this.getQuotaStatus(org.id);
            return {
              organizationId: org.id,
              status: quotaStatus,
            };
          } catch (error) {
            logger.error(
              `Error checking quotas for organization ${org.id}:`,
              error
            );
            return {
              organizationId: org.id,
              error: error.message,
            };
          }
        })
      );

      logger.info(`Checked quotas for ${results.length} organizations`);

      return results;
    } catch (error) {
      logger.error("Error checking all organization quotas:", error);
      throw error;
    }
  }
}

module.exports = new QuotaService();
