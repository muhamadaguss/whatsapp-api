const cron = require("node-cron");
const subscriptionService = require("../services/subscriptionService");
const usageTrackingService = require("../services/usageTrackingService");
const quotaService = require("../services/quotaService");
const logger = require("../utils/logger");

/**
 * 🕐 Cron Jobs for SaaS Platform
 *
 * Scheduled tasks for:
 * - Checking expired subscriptions
 * - Resetting monthly usage
 * - Monitoring quota usage across all organizations
 */

class CronJobs {
  constructor() {
    this.jobs = {};
  }

  /**
   * Initialize and start all cron jobs
   */
  startAll() {
    logger.info("🕐 Starting cron jobs...");

    // Job 1: Check expired subscriptions (runs every day at 00:00)
    this.jobs.checkExpiredSubscriptions = cron.schedule(
      "0 0 * * *",
      async () => {
        await this.runCheckExpiredSubscriptions();
      },
      {
        timezone: "Asia/Jakarta", // Change to your timezone
      }
    );

    // Job 2: Reset monthly usage (runs on 1st day of every month at 00:00)
    this.jobs.resetMonthlyUsage = cron.schedule(
      "0 0 1 * *",
      async () => {
        await this.runResetMonthlyUsage();
      },
      {
        timezone: "Asia/Jakarta",
      }
    );

    // Job 3: Check all organization quotas (runs every 6 hours)
    this.jobs.checkAllQuotas = cron.schedule(
      "0 */6 * * *",
      async () => {
        await this.runCheckAllQuotas();
      },
      {
        timezone: "Asia/Jakarta",
      }
    );

    // Job 4: Subscription renewal reminders (runs every day at 09:00)
    this.jobs.subscriptionReminders = cron.schedule(
      "0 9 * * *",
      async () => {
        await this.runSubscriptionReminders();
      },
      {
        timezone: "Asia/Jakarta",
      }
    );

    logger.info("✅ All cron jobs started successfully");
    this.logSchedules();
  }

  /**
   * Stop all cron jobs
   */
  stopAll() {
    logger.info("🛑 Stopping all cron jobs...");

    Object.keys(this.jobs).forEach((jobName) => {
      if (this.jobs[jobName]) {
        this.jobs[jobName].stop();
        logger.info(`  ✓ Stopped: ${jobName}`);
      }
    });

    logger.info("✅ All cron jobs stopped");
  }

  /**
   * Log all cron job schedules
   */
  logSchedules() {
    logger.info("📅 Cron job schedules:");
    logger.info("  • Check Expired Subscriptions: Daily at 00:00");
    logger.info("  • Reset Monthly Usage: 1st day of month at 00:00");
    logger.info("  • Check All Quotas: Every 6 hours");
    logger.info("  • Subscription Reminders: Daily at 09:00");
  }

  /**
   * Job 1: Check and process expired subscriptions
   */
  async runCheckExpiredSubscriptions() {
    const jobName = "Check Expired Subscriptions";
    logger.info(`🕐 [${jobName}] Starting...`);

    try {
      const startTime = Date.now();

      // Check and expire subscriptions
      const results = await subscriptionService.checkExpiredSubscriptions();

      const duration = Date.now() - startTime;
      logger.info(
        `✅ [${jobName}] Completed in ${duration}ms. Processed ${results.length} subscriptions.`
      );

      // Log expired subscriptions
      const expired = results.filter((r) => r.expired);
      if (expired.length > 0) {
        logger.warn(
          `⚠️ [${jobName}] ${expired.length} subscriptions expired:`,
          expired.map((r) => r.organizationId)
        );
      }

      return results;
    } catch (error) {
      logger.error(`❌ [${jobName}] Failed:`, error);
      throw error;
    }
  }

  /**
   * Job 2: Reset monthly usage for all organizations
   */
  async runResetMonthlyUsage() {
    const jobName = "Reset Monthly Usage";
    logger.info(`🕐 [${jobName}] Starting...`);

    try {
      const startTime = Date.now();

      // Reset monthly usage
      const results = await usageTrackingService.resetMonthlyUsage();

      const duration = Date.now() - startTime;
      logger.info(
        `✅ [${jobName}] Completed in ${duration}ms. Reset usage for ${results.resetCount} organizations.`
      );

      return results;
    } catch (error) {
      logger.error(`❌ [${jobName}] Failed:`, error);
      throw error;
    }
  }

  /**
   * Job 3: Check quota usage for all organizations
   */
  async runCheckAllQuotas() {
    const jobName = "Check All Quotas";
    logger.info(`🕐 [${jobName}] Starting...`);

    try {
      const startTime = Date.now();

      // Check quotas for all organizations
      const results = await quotaService.checkAllOrganizationQuotas();

      const duration = Date.now() - startTime;
      logger.info(
        `✅ [${jobName}] Completed in ${duration}ms. Checked ${results.length} organizations.`
      );

      // Count organizations with quota issues
      const withIssues = results.filter(
        (r) =>
          !r.error &&
          Object.values(r.status || {}).some((s) =>
            ["warning", "critical", "exceeded"].includes(s.status)
          )
      );

      if (withIssues.length > 0) {
        logger.warn(
          `⚠️ [${jobName}] ${withIssues.length} organizations have quota issues`
        );
      }

      return results;
    } catch (error) {
      logger.error(`❌ [${jobName}] Failed:`, error);
      throw error;
    }
  }

  /**
   * Job 4: Send subscription renewal reminders
   */
  async runSubscriptionReminders() {
    const jobName = "Subscription Reminders";
    logger.info(`🕐 [${jobName}] Starting...`);

    try {
      const startTime = Date.now();
      const notificationService = require("../services/notificationService");
      const { Subscription, Organization } = require("../models");
      const { Op } = require("sequelize");

      // Find subscriptions expiring in 7, 3, or 1 day(s)
      const today = new Date();
      const reminderDays = [7, 3, 1];
      let totalSent = 0;

      for (const days of reminderDays) {
        const targetDate = new Date(today);
        targetDate.setDate(targetDate.getDate() + days);
        targetDate.setHours(0, 0, 0, 0);

        const endOfTargetDate = new Date(targetDate);
        endOfTargetDate.setHours(23, 59, 59, 999);

        const subscriptions = await Subscription.findAll({
          where: {
            status: "active",
            expiresAt: {
              [Op.between]: [targetDate, endOfTargetDate],
            },
          },
          include: [
            {
              model: Organization,
              as: "organization",
              where: { status: "active" },
            },
          ],
        });

        // Send reminders
        for (const subscription of subscriptions) {
          try {
            await notificationService.sendSubscriptionExpirationAlert(
              subscription.organizationId,
              {
                planName: subscription.planName,
                expiresAt: subscription.expiresAt,
                daysRemaining: days,
              }
            );

            totalSent++;
            logger.info(
              `📧 Sent ${days}-day reminder to organization ${subscription.organizationId}`
            );
          } catch (error) {
            logger.error(
              `❌ Failed to send reminder to organization ${subscription.organizationId}:`,
              error
            );
          }
        }

        logger.info(
          `📧 Sent ${subscriptions.length} reminders for ${days}-day expiration`
        );
      }

      const duration = Date.now() - startTime;
      logger.info(
        `✅ [${jobName}] Completed in ${duration}ms. Sent ${totalSent} reminders.`
      );

      return { totalSent };
    } catch (error) {
      logger.error(`❌ [${jobName}] Failed:`, error);
      throw error;
    }
  }

  /**
   * Manually run a specific job (for testing)
   */
  async runJob(jobName) {
    const methodName = `run${jobName}`;
    if (typeof this[methodName] === "function") {
      logger.info(`🔧 Manually running job: ${jobName}`);
      return await this[methodName]();
    } else {
      throw new Error(`Job not found: ${jobName}`);
    }
  }

  /**
   * Get status of all cron jobs
   */
  getStatus() {
    const status = {};

    Object.keys(this.jobs).forEach((jobName) => {
      const job = this.jobs[jobName];
      if (job) {
        status[jobName] = {
          running: job.running || false,
          // Add more status info if needed
        };
      }
    });

    return status;
  }
}

// Export singleton instance
module.exports = new CronJobs();
