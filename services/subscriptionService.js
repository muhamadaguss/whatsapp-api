/**
 * Subscription Service
 * 
 * Business logic for subscription and plan management.
 * Handles plan selection, upgrades, downgrades, and subscription lifecycle.
 */

const Subscription = require("../models/subscriptionModel");
const SubscriptionPlan = require("../models/subscriptionPlanModel");
const Organization = require("../models/organizationModel");
const { v4: uuidv4 } = require("crypto").randomUUID ? require("crypto") : require("uuid");
const logger = require("../utils/logger");
const { Op } = require("sequelize");

class SubscriptionService {
  /**
   * Get all available subscription plans
   */
  async getAllPlans() {
    try {
      const plans = await SubscriptionPlan.findAll({
        where: { isVisible: true },
        order: [["sortOrder", "ASC"]],
      });

      return plans;
    } catch (error) {
      logger.error("Error getting subscription plans:", error);
      throw error;
    }
  }

  /**
   * Get specific plan by ID
   */
  async getPlanById(planId) {
    try {
      const plan = await SubscriptionPlan.findByPk(planId);

      if (!plan) {
        throw new Error("Subscription plan not found");
      }

      return plan;
    } catch (error) {
      logger.error("Error getting plan by ID:", error);
      throw error;
    }
  }

  /**
   * Get plan by name
   */
  async getPlanByName(planName) {
    try {
      const plan = await SubscriptionPlan.findOne({
        where: { name: planName },
      });

      if (!plan) {
        throw new Error("Subscription plan not found");
      }

      return plan;
    } catch (error) {
      logger.error("Error getting plan by name:", error);
      throw error;
    }
  }

  /**
   * Get current subscription for organization
   */
  async getCurrentSubscription(organizationId) {
    try {
      const subscription = await Subscription.findOne({
        where: {
          organizationId,
          status: { [Op.in]: ["active", "trial"] },
        },
        include: [
          {
            model: SubscriptionPlan,
            as: "plan",
          },
        ],
        order: [["createdAt", "DESC"]],
      });

      return subscription;
    } catch (error) {
      logger.error("Error getting current subscription:", error);
      throw error;
    }
  }

  /**
   * Get subscription history for organization
   */
  async getSubscriptionHistory(organizationId) {
    try {
      const subscriptions = await Subscription.findAll({
        where: { organizationId },
        include: [
          {
            model: SubscriptionPlan,
            as: "plan",
          },
        ],
        order: [["createdAt", "DESC"]],
      });

      return subscriptions;
    } catch (error) {
      logger.error("Error getting subscription history:", error);
      throw error;
    }
  }

  /**
   * Create new subscription
   */
  async createSubscription(organizationId, planId, billingCycle = "monthly") {
    try {
      const organization = await Organization.findByPk(organizationId);
      if (!organization) {
        throw new Error("Organization not found");
      }

      const plan = await this.getPlanById(planId);

      // Check if there's an active subscription
      const existingSubscription = await this.getCurrentSubscription(organizationId);
      if (existingSubscription) {
        throw new Error(
          "Organization already has an active subscription. Use upgrade/downgrade instead."
        );
      }

      // Calculate subscription dates
      const startDate = new Date();
      const endDate = new Date();
      
      if (billingCycle === "monthly") {
        endDate.setMonth(endDate.getMonth() + 1);
      } else if (billingCycle === "yearly") {
        endDate.setFullYear(endDate.getFullYear() + 1);
      }

      // Determine amount based on billing cycle
      const amount =
        billingCycle === "yearly" ? plan.priceYearly : plan.priceMonthly;

      // Create subscription
      const subscription = await Subscription.create({
        id: uuidv4(),
        organizationId,
        planId,
        status: "active",
        startDate,
        endDate,
        billingCycle,
        autoRenew: true,
        amount,
        currency: plan.currency,
        metadata: {},
      });

      // Update organization
      await organization.update({
        subscriptionPlan: plan.name,
        subscriptionStatus: "active",
        subscriptionStartsAt: startDate,
        subscriptionEndsAt: endDate,
      });

      logger.info(
        `Subscription created for organization ${organizationId}: ${plan.name} (${billingCycle})`
      );

      return subscription;
    } catch (error) {
      logger.error("Error creating subscription:", error);
      throw error;
    }
  }

  /**
   * Upgrade subscription to higher plan
   */
  async upgradeSubscription(organizationId, newPlanId, billingCycle) {
    try {
      const currentSubscription = await this.getCurrentSubscription(organizationId);
      
      if (!currentSubscription) {
        throw new Error("No active subscription found");
      }

      const newPlan = await this.getPlanById(newPlanId);
      const currentPlan = currentSubscription.plan;

      // Validate upgrade (new plan should have higher sortOrder or different features)
      if (newPlan.sortOrder <= currentPlan.sortOrder && newPlan.id !== 4) {
        throw new Error("New plan must be higher tier than current plan");
      }

      // Cancel current subscription
      await currentSubscription.update({
        status: "cancelled",
        cancelledAt: new Date(),
        metadata: {
          ...currentSubscription.metadata,
          cancelReason: "upgraded",
          upgradedTo: newPlan.name,
        },
      });

      // Create new subscription
      const newSubscription = await this.createSubscription(
        organizationId,
        newPlanId,
        billingCycle || currentSubscription.billingCycle
      );

      logger.info(
        `Subscription upgraded for organization ${organizationId}: ${currentPlan.name} → ${newPlan.name}`
      );

      return newSubscription;
    } catch (error) {
      logger.error("Error upgrading subscription:", error);
      throw error;
    }
  }

  /**
   * Downgrade subscription to lower plan
   */
  async downgradeSubscription(organizationId, newPlanId, immediate = false) {
    try {
      const currentSubscription = await this.getCurrentSubscription(organizationId);
      
      if (!currentSubscription) {
        throw new Error("No active subscription found");
      }

      const newPlan = await this.getPlanById(newPlanId);
      const currentPlan = currentSubscription.plan;

      // Validate downgrade
      if (newPlan.sortOrder >= currentPlan.sortOrder && newPlan.id !== 1) {
        throw new Error("New plan must be lower tier than current plan");
      }

      if (immediate) {
        // Immediate downgrade - cancel current and create new
        await currentSubscription.update({
          status: "cancelled",
          cancelledAt: new Date(),
          metadata: {
            ...currentSubscription.metadata,
            cancelReason: "downgraded",
            downgradedTo: newPlan.name,
          },
        });

        const newSubscription = await this.createSubscription(
          organizationId,
          newPlanId,
          currentSubscription.billingCycle
        );

        logger.info(
          `Subscription downgraded immediately for organization ${organizationId}: ${currentPlan.name} → ${newPlan.name}`
        );

        return newSubscription;
      } else {
        // Schedule downgrade at end of current period
        await currentSubscription.update({
          metadata: {
            ...currentSubscription.metadata,
            scheduledDowngrade: {
              planId: newPlanId,
              planName: newPlan.name,
              scheduledAt: new Date(),
              effectiveDate: currentSubscription.endDate,
            },
          },
        });

        logger.info(
          `Subscription downgrade scheduled for organization ${organizationId}: ${currentPlan.name} → ${newPlan.name} (effective: ${currentSubscription.endDate})`
        );

        return currentSubscription;
      }
    } catch (error) {
      logger.error("Error downgrading subscription:", error);
      throw error;
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(organizationId, reason, immediate = false) {
    try {
      const currentSubscription = await this.getCurrentSubscription(organizationId);
      
      if (!currentSubscription) {
        throw new Error("No active subscription found");
      }

      const organization = await Organization.findByPk(organizationId);

      if (immediate) {
        // Cancel immediately and move to free plan
        await currentSubscription.update({
          status: "cancelled",
          cancelledAt: new Date(),
          metadata: {
            ...currentSubscription.metadata,
            cancelReason: reason,
          },
        });

        // Move to free plan
        const freePlan = await this.getPlanByName("free");
        await this.createSubscription(organizationId, freePlan.id, "monthly");

        logger.info(`Subscription cancelled immediately for organization ${organizationId}`);
      } else {
        // Schedule cancellation at end of period
        await currentSubscription.update({
          autoRenew: false,
          metadata: {
            ...currentSubscription.metadata,
            scheduledCancellation: {
              reason,
              scheduledAt: new Date(),
              effectiveDate: currentSubscription.endDate,
            },
          },
        });

        logger.info(
          `Subscription cancellation scheduled for organization ${organizationId} (effective: ${currentSubscription.endDate})`
        );
      }

      return currentSubscription;
    } catch (error) {
      logger.error("Error cancelling subscription:", error);
      throw error;
    }
  }

  /**
   * Renew subscription
   */
  async renewSubscription(subscriptionId) {
    try {
      const subscription = await Subscription.findByPk(subscriptionId, {
        include: [{ model: SubscriptionPlan, as: "plan" }],
      });

      if (!subscription) {
        throw new Error("Subscription not found");
      }

      // Check if subscription should be renewed
      if (!subscription.autoRenew) {
        throw new Error("Subscription is not set to auto-renew");
      }

      // Calculate new dates
      const startDate = subscription.endDate;
      const endDate = new Date(startDate);
      
      if (subscription.billingCycle === "monthly") {
        endDate.setMonth(endDate.getMonth() + 1);
      } else if (subscription.billingCycle === "yearly") {
        endDate.setFullYear(endDate.getFullYear() + 1);
      }

      // Update subscription
      await subscription.update({
        startDate,
        endDate,
        status: "active",
      });

      // Update organization
      await Organization.update(
        {
          subscriptionEndsAt: endDate,
        },
        {
          where: { id: subscription.organizationId },
        }
      );

      logger.info(`Subscription renewed for organization ${subscription.organizationId}`);

      return subscription;
    } catch (error) {
      logger.error("Error renewing subscription:", error);
      throw error;
    }
  }

  /**
   * Check if subscription is expired
   */
  async checkExpiredSubscriptions() {
    try {
      const expiredSubscriptions = await Subscription.findAll({
        where: {
          status: "active",
          endDate: { [Op.lt]: new Date() },
        },
        include: [
          {
            model: SubscriptionPlan,
            as: "plan",
          },
        ],
      });

      for (const subscription of expiredSubscriptions) {
        if (subscription.autoRenew) {
          // Auto-renew
          await this.renewSubscription(subscription.id);
        } else {
          // Expire subscription
          await subscription.update({ status: "expired" });

          // Move to free plan
          const freePlan = await this.getPlanByName("free");
          await this.createSubscription(
            subscription.organizationId,
            freePlan.id,
            "monthly"
          );

          logger.info(
            `Subscription expired for organization ${subscription.organizationId}, moved to free plan`
          );
        }
      }

      logger.info(`Checked ${expiredSubscriptions.length} expired subscriptions`);

      return expiredSubscriptions.length;
    } catch (error) {
      logger.error("Error checking expired subscriptions:", error);
      throw error;
    }
  }

  /**
   * Get quotas for organization based on current plan
   */
  async getOrganizationQuotas(organizationId) {
    try {
      const subscription = await this.getCurrentSubscription(organizationId);

      if (!subscription || !subscription.plan) {
        // Return free plan quotas as default
        const freePlan = await this.getPlanByName("free");
        return freePlan.quotas;
      }

      return subscription.plan.quotas;
    } catch (error) {
      logger.error("Error getting organization quotas:", error);
      throw error;
    }
  }

  /**
   * Get features for organization based on current plan
   */
  async getOrganizationFeatures(organizationId) {
    try {
      const subscription = await this.getCurrentSubscription(organizationId);

      if (!subscription || !subscription.plan) {
        // Return free plan features as default
        const freePlan = await this.getPlanByName("free");
        return freePlan.features;
      }

      return subscription.plan.features;
    } catch (error) {
      logger.error("Error getting organization features:", error);
      throw error;
    }
  }

  /**
   * Check if organization has specific feature
   */
  async hasFeature(organizationId, featureName) {
    try {
      const features = await this.getOrganizationFeatures(organizationId);
      return features[featureName] === true;
    } catch (error) {
      logger.error("Error checking feature:", error);
      return false;
    }
  }

  /**
   * Get subscription summary for dashboard
   */
  async getSubscriptionSummary(organizationId) {
    try {
      const subscription = await this.getCurrentSubscription(organizationId);

      if (!subscription) {
        return {
          hasSubscription: false,
          planName: "No Plan",
          status: "inactive",
        };
      }

      const daysUntilRenewal = Math.ceil(
        (new Date(subscription.endDate) - new Date()) / (1000 * 60 * 60 * 24)
      );

      return {
        hasSubscription: true,
        planName: subscription.plan.displayName,
        planId: subscription.plan.id,
        status: subscription.status,
        billingCycle: subscription.billingCycle,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        daysUntilRenewal,
        autoRenew: subscription.autoRenew,
        amount: subscription.amount,
        currency: subscription.currency,
        quotas: subscription.plan.quotas,
        features: subscription.plan.features,
      };
    } catch (error) {
      logger.error("Error getting subscription summary:", error);
      throw error;
    }
  }
}

module.exports = new SubscriptionService();
