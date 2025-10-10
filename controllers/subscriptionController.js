/**
 * Subscription Controller
 * 
 * HTTP request handlers for subscription management endpoints.
 * Handles plan viewing, subscription creation, upgrades, downgrades, and cancellations.
 */

const subscriptionService = require("../services/subscriptionService");
const logger = require("../utils/logger");

class SubscriptionController {
  /**
   * GET /api/subscriptions/plans
   * Get all available subscription plans
   */
  async getAllPlans(req, res) {
    try {
      const plans = await subscriptionService.getAllPlans();

      return res.status(200).json({
        success: true,
        data: plans,
      });
    } catch (error) {
      logger.error("Error in getAllPlans:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch subscription plans",
        error: error.message,
      });
    }
  }

  /**
   * GET /api/subscriptions/plans/:planId
   * Get specific plan by ID
   */
  async getPlanById(req, res) {
    try {
      const { planId } = req.params;

      const plan = await subscriptionService.getPlanById(planId);

      return res.status(200).json({
        success: true,
        data: plan,
      });
    } catch (error) {
      logger.error("Error in getPlanById:", error);
      const statusCode = error.message === "Subscription plan not found" ? 404 : 500;
      
      return res.status(statusCode).json({
        success: false,
        message: "Failed to fetch subscription plan",
        error: error.message,
      });
    }
  }

  /**
   * GET /api/subscriptions/current
   * Get current subscription for authenticated organization
   */
  async getCurrentSubscription(req, res) {
    try {
      const { organizationId } = req.tenant;

      const subscription = await subscriptionService.getCurrentSubscription(organizationId);

      if (!subscription) {
        return res.status(404).json({
          success: false,
          message: "No active subscription found",
        });
      }

      return res.status(200).json({
        success: true,
        data: subscription,
      });
    } catch (error) {
      logger.error("Error in getCurrentSubscription:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch current subscription",
        error: error.message,
      });
    }
  }

  /**
   * GET /api/subscriptions/summary
   * Get subscription summary for dashboard
   */
  async getSubscriptionSummary(req, res) {
    try {
      const { organizationId } = req.tenant;

      const summary = await subscriptionService.getSubscriptionSummary(organizationId);

      return res.status(200).json({
        success: true,
        data: summary,
      });
    } catch (error) {
      logger.error("Error in getSubscriptionSummary:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch subscription summary",
        error: error.message,
      });
    }
  }

  /**
   * GET /api/subscriptions/history
   * Get subscription history for organization
   */
  async getSubscriptionHistory(req, res) {
    try {
      const { organizationId } = req.tenant;

      const subscriptions = await subscriptionService.getSubscriptionHistory(organizationId);

      return res.status(200).json({
        success: true,
        data: subscriptions,
      });
    } catch (error) {
      logger.error("Error in getSubscriptionHistory:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch subscription history",
        error: error.message,
      });
    }
  }

  /**
   * POST /api/subscriptions
   * Create new subscription
   * Body: { planId, billingCycle: "monthly" | "yearly" }
   */
  async createSubscription(req, res) {
    try {
      const { organizationId, roleInOrg } = req.tenant;
      const { planId, billingCycle = "monthly" } = req.body;

      // Only owner can create subscription
      if (roleInOrg !== "owner") {
        return res.status(403).json({
          success: false,
          message: "Only organization owner can create subscriptions",
        });
      }

      // Validate input
      if (!planId) {
        return res.status(400).json({
          success: false,
          message: "planId is required",
        });
      }

      if (!["monthly", "yearly"].includes(billingCycle)) {
        return res.status(400).json({
          success: false,
          message: "billingCycle must be 'monthly' or 'yearly'",
        });
      }

      const subscription = await subscriptionService.createSubscription(
        organizationId,
        planId,
        billingCycle
      );

      return res.status(201).json({
        success: true,
        message: "Subscription created successfully",
        data: subscription,
      });
    } catch (error) {
      logger.error("Error in createSubscription:", error);
      const statusCode = error.message.includes("already has an active subscription") ? 400 : 500;
      
      return res.status(statusCode).json({
        success: false,
        message: "Failed to create subscription",
        error: error.message,
      });
    }
  }

  /**
   * POST /api/subscriptions/upgrade
   * Upgrade current subscription to higher plan
   * Body: { planId, billingCycle?: "monthly" | "yearly" }
   */
  async upgradeSubscription(req, res) {
    try {
      const { organizationId, roleInOrg } = req.tenant;
      const { planId, billingCycle } = req.body;

      // Only owner can upgrade subscription
      if (roleInOrg !== "owner") {
        return res.status(403).json({
          success: false,
          message: "Only organization owner can upgrade subscriptions",
        });
      }

      // Validate input
      if (!planId) {
        return res.status(400).json({
          success: false,
          message: "planId is required",
        });
      }

      if (billingCycle && !["monthly", "yearly"].includes(billingCycle)) {
        return res.status(400).json({
          success: false,
          message: "billingCycle must be 'monthly' or 'yearly'",
        });
      }

      const subscription = await subscriptionService.upgradeSubscription(
        organizationId,
        planId,
        billingCycle
      );

      return res.status(200).json({
        success: true,
        message: "Subscription upgraded successfully",
        data: subscription,
      });
    } catch (error) {
      logger.error("Error in upgradeSubscription:", error);
      const statusCode =
        error.message === "No active subscription found"
          ? 404
          : error.message.includes("must be higher tier")
          ? 400
          : 500;
      
      return res.status(statusCode).json({
        success: false,
        message: "Failed to upgrade subscription",
        error: error.message,
      });
    }
  }

  /**
   * POST /api/subscriptions/downgrade
   * Downgrade current subscription to lower plan
   * Body: { planId, immediate?: boolean }
   */
  async downgradeSubscription(req, res) {
    try {
      const { organizationId, roleInOrg } = req.tenant;
      const { planId, immediate = false } = req.body;

      // Only owner can downgrade subscription
      if (roleInOrg !== "owner") {
        return res.status(403).json({
          success: false,
          message: "Only organization owner can downgrade subscriptions",
        });
      }

      // Validate input
      if (!planId) {
        return res.status(400).json({
          success: false,
          message: "planId is required",
        });
      }

      const subscription = await subscriptionService.downgradeSubscription(
        organizationId,
        planId,
        immediate
      );

      const message = immediate
        ? "Subscription downgraded successfully"
        : "Subscription downgrade scheduled at end of billing period";

      return res.status(200).json({
        success: true,
        message,
        data: subscription,
      });
    } catch (error) {
      logger.error("Error in downgradeSubscription:", error);
      const statusCode =
        error.message === "No active subscription found"
          ? 404
          : error.message.includes("must be lower tier")
          ? 400
          : 500;
      
      return res.status(statusCode).json({
        success: false,
        message: "Failed to downgrade subscription",
        error: error.message,
      });
    }
  }

  /**
   * POST /api/subscriptions/cancel
   * Cancel current subscription
   * Body: { reason, immediate?: boolean }
   */
  async cancelSubscription(req, res) {
    try {
      const { organizationId, roleInOrg } = req.tenant;
      const { reason, immediate = false } = req.body;

      // Only owner can cancel subscription
      if (roleInOrg !== "owner") {
        return res.status(403).json({
          success: false,
          message: "Only organization owner can cancel subscriptions",
        });
      }

      const subscription = await subscriptionService.cancelSubscription(
        organizationId,
        reason || "No reason provided",
        immediate
      );

      const message = immediate
        ? "Subscription cancelled successfully, moved to free plan"
        : "Subscription cancellation scheduled at end of billing period";

      return res.status(200).json({
        success: true,
        message,
        data: subscription,
      });
    } catch (error) {
      logger.error("Error in cancelSubscription:", error);
      const statusCode = error.message === "No active subscription found" ? 404 : 500;
      
      return res.status(statusCode).json({
        success: false,
        message: "Failed to cancel subscription",
        error: error.message,
      });
    }
  }

  /**
   * GET /api/subscriptions/quotas
   * Get quotas for current organization based on their plan
   */
  async getOrganizationQuotas(req, res) {
    try {
      const { organizationId } = req.tenant;

      const quotas = await subscriptionService.getOrganizationQuotas(organizationId);

      return res.status(200).json({
        success: true,
        data: quotas,
      });
    } catch (error) {
      logger.error("Error in getOrganizationQuotas:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch organization quotas",
        error: error.message,
      });
    }
  }

  /**
   * GET /api/subscriptions/features
   * Get features for current organization based on their plan
   */
  async getOrganizationFeatures(req, res) {
    try {
      const { organizationId } = req.tenant;

      const features = await subscriptionService.getOrganizationFeatures(organizationId);

      return res.status(200).json({
        success: true,
        data: features,
      });
    } catch (error) {
      logger.error("Error in getOrganizationFeatures:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch organization features",
        error: error.message,
      });
    }
  }

  /**
   * GET /api/subscriptions/features/:featureName
   * Check if organization has specific feature
   */
  async checkFeature(req, res) {
    try {
      const { organizationId } = req.tenant;
      const { featureName } = req.params;

      const hasFeature = await subscriptionService.hasFeature(organizationId, featureName);

      return res.status(200).json({
        success: true,
        data: {
          featureName,
          hasFeature,
        },
      });
    } catch (error) {
      logger.error("Error in checkFeature:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to check feature",
        error: error.message,
      });
    }
  }
}

module.exports = new SubscriptionController();
