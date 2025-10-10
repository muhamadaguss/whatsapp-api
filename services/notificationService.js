const nodemailer = require("nodemailer");
const axios = require("axios");
const logger = require("../utils/logger");
const User = require("../models/userModel");
const Organization = require("../models/organizationModel");

/**
 * 🔔 Notification Service
 *
 * Handles sending notifications via email and webhooks for quota alerts
 * and other important system events
 */

class NotificationService {
  constructor() {
    // Initialize email transporter
    this.emailTransporter = this.createEmailTransporter();
  }

  /**
   * Create email transporter
   */
  createEmailTransporter() {
    const emailConfig = {
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === "true", // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    };

    // Skip email setup if credentials not configured
    if (!process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
      logger.warn("⚠️ SMTP credentials not configured. Email notifications will be disabled.");
      return null;
    }

    try {
      const transporter = nodemailer.createTransporter(emailConfig);
      logger.info("✅ Email transporter initialized");
      return transporter;
    } catch (error) {
      logger.error("❌ Failed to create email transporter:", error);
      return null;
    }
  }

  /**
   * Send quota alert notification
   *
   * @param {string} organizationId - Organization ID
   * @param {Object} alertData - Alert details
   */
  async sendQuotaAlert(organizationId, alertData) {
    try {
      const organization = await Organization.findByPk(organizationId);
      if (!organization) {
        logger.error(`❌ Organization not found: ${organizationId}`);
        return;
      }

      // Get organization admins/owners
      const admins = await User.findAll({
        where: {
          organizationId,
          role: ["admin", "owner"],
        },
      });

      if (admins.length === 0) {
        logger.warn(`⚠️ No admins found for organization ${organizationId}`);
        return;
      }

      // Prepare notification content
      const subject = this.getAlertSubject(alertData);
      const htmlContent = this.getAlertEmailHtml(organization, alertData);
      const textContent = this.getAlertEmailText(organization, alertData);

      // Send email to all admins
      const emailPromises = admins.map((admin) =>
        this.sendEmail(admin.email, subject, htmlContent, textContent)
      );

      // Send webhook if configured
      if (organization.webhookUrl) {
        emailPromises.push(this.sendWebhook(organization.webhookUrl, {
          organizationId,
          organizationName: organization.name,
          ...alertData,
        }));
      }

      await Promise.allSettled(emailPromises);

      logger.info(`📧 Quota alert sent to ${admins.length} admin(s) for organization ${organizationId}`);
    } catch (error) {
      logger.error(`❌ Failed to send quota alert:`, error);
    }
  }

  /**
   * Send email notification
   *
   * @param {string} to - Recipient email
   * @param {string} subject - Email subject
   * @param {string} html - HTML content
   * @param {string} text - Plain text content
   */
  async sendEmail(to, subject, html, text) {
    if (!this.emailTransporter) {
      logger.warn("⚠️ Email transporter not available. Skipping email.");
      return;
    }

    try {
      const mailOptions = {
        from: `"${process.env.APP_NAME || "WhatsApp SaaS"}" <${process.env.SMTP_USER}>`,
        to,
        subject,
        html,
        text,
      };

      const info = await this.emailTransporter.sendMail(mailOptions);
      logger.info(`📧 Email sent: ${info.messageId} to ${to}`);
      return info;
    } catch (error) {
      logger.error(`❌ Failed to send email to ${to}:`, error);
      throw error;
    }
  }

  /**
   * Send webhook notification
   *
   * @param {string} webhookUrl - Webhook URL
   * @param {Object} payload - Webhook payload
   */
  async sendWebhook(webhookUrl, payload) {
    try {
      const response = await axios.post(
        webhookUrl,
        {
          event: "quota_alert",
          timestamp: new Date().toISOString(),
          data: payload,
        },
        {
          timeout: 10000, // 10 seconds
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "WhatsApp-SaaS-Notification/1.0",
          },
        }
      );

      logger.info(`🔗 Webhook sent to ${webhookUrl}: ${response.status}`);
      return response;
    } catch (error) {
      logger.error(`❌ Failed to send webhook to ${webhookUrl}:`, error.message);
      throw error;
    }
  }

  /**
   * Get alert email subject
   */
  getAlertSubject(alertData) {
    const { metricType, percentage, status } = alertData;

    const emoji = {
      warning: "⚠️",
      critical: "🚨",
      exceeded: "❌",
    }[status] || "📊";

    return `${emoji} ${status.toUpperCase()}: ${metricType} quota at ${percentage}%`;
  }

  /**
   * Get alert email HTML content
   */
  getAlertEmailHtml(organization, alertData) {
    const { metricType, current, limit, percentage, status } = alertData;

    const statusColor = {
      warning: "#f59e0b", // amber-500
      critical: "#ef4444", // red-500
      exceeded: "#dc2626", // red-600
    }[status] || "#3b82f6"; // blue-500

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Quota Alert</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="margin: 0; font-size: 28px;">Quota Alert</h1>
    <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">${organization.name}</p>
  </div>
  
  <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
    <div style="background: white; padding: 20px; border-radius: 8px; border-left: 4px solid ${statusColor};">
      <h2 style="margin: 0 0 15px 0; color: ${statusColor}; font-size: 20px;">
        ${status.toUpperCase()} Status
      </h2>
      
      <p style="margin: 10px 0; font-size: 16px;">
        Your <strong>${metricType}</strong> usage has reached <strong style="color: ${statusColor};">${percentage}%</strong> of your quota limit.
      </p>
      
      <div style="background: #f3f4f6; padding: 15px; border-radius: 6px; margin: 20px 0;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; font-weight: 600;">Metric:</td>
            <td style="padding: 8px 0; text-align: right;">${metricType}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: 600;">Current Usage:</td>
            <td style="padding: 8px 0; text-align: right;">${current.toLocaleString()}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: 600;">Quota Limit:</td>
            <td style="padding: 8px 0; text-align: right;">${limit.toLocaleString()}</td>
          </tr>
          <tr style="border-top: 2px solid #d1d5db;">
            <td style="padding: 8px 0; font-weight: 600;">Percentage:</td>
            <td style="padding: 8px 0; text-align: right; color: ${statusColor}; font-size: 18px; font-weight: bold;">
              ${percentage}%
            </td>
          </tr>
        </table>
      </div>
      
      ${
        status === "exceeded"
          ? `
      <div style="background: #fee2e2; border: 1px solid #fecaca; padding: 15px; border-radius: 6px; margin: 20px 0;">
        <p style="margin: 0; color: #dc2626; font-weight: 600;">⚠️ Quota Exceeded</p>
        <p style="margin: 10px 0 0 0; color: #991b1b;">
          Your quota limit has been exceeded. Some features may be temporarily restricted until you upgrade your plan or the quota resets.
        </p>
      </div>
      `
          : ""
      }
      
      <h3 style="margin: 25px 0 10px 0; font-size: 16px;">Recommended Actions:</h3>
      <ul style="margin: 0; padding-left: 20px;">
        ${
          percentage >= 100
            ? `
        <li style="margin: 5px 0;">⚠️ <strong>Upgrade your plan</strong> to increase quota limits</li>
        <li style="margin: 5px 0;">🔄 Wait for monthly quota reset</li>
        <li style="margin: 5px 0;">📞 Contact support for assistance</li>
        `
            : percentage >= 95
            ? `
        <li style="margin: 5px 0;">📈 Consider upgrading your plan before reaching the limit</li>
        <li style="margin: 5px 0;">📊 Review your usage patterns</li>
        <li style="margin: 5px 0;">🗑️ Clean up unused resources if applicable</li>
        `
            : `
        <li style="margin: 5px 0;">📊 Monitor your usage regularly</li>
        <li style="margin: 5px 0;">📈 Plan ahead for increased usage</li>
        `
        }
      </ul>
    </div>
    
    <div style="margin-top: 30px; padding: 20px; background: white; border-radius: 8px; text-align: center;">
      <a href="${process.env.APP_URL || "http://localhost:5173"}/dashboard" 
         style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; padding: 12px 30px; border-radius: 6px; font-weight: 600;">
        View Dashboard
      </a>
    </div>
  </div>
  
  <div style="background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px; text-align: center; font-size: 14px; color: #6b7280;">
    <p style="margin: 0 0 10px 0;">
      This is an automated notification from ${process.env.APP_NAME || "WhatsApp SaaS"}
    </p>
    <p style="margin: 0;">
      If you have any questions, please contact our support team.
    </p>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Get alert email plain text content
   */
  getAlertEmailText(organization, alertData) {
    const { metricType, current, limit, percentage, status } = alertData;

    return `
QUOTA ALERT - ${status.toUpperCase()}

Organization: ${organization.name}

Your ${metricType} usage has reached ${percentage}% of your quota limit.

Details:
- Metric: ${metricType}
- Current Usage: ${current.toLocaleString()}
- Quota Limit: ${limit.toLocaleString()}
- Percentage: ${percentage}%

${
  status === "exceeded"
    ? `
⚠️ QUOTA EXCEEDED
Your quota limit has been exceeded. Some features may be temporarily restricted.
`
    : ""
}

Recommended Actions:
${
  percentage >= 100
    ? `
- Upgrade your plan to increase quota limits
- Wait for monthly quota reset
- Contact support for assistance
`
    : percentage >= 95
    ? `
- Consider upgrading your plan before reaching the limit
- Review your usage patterns
- Clean up unused resources if applicable
`
    : `
- Monitor your usage regularly
- Plan ahead for increased usage
`
}

View your dashboard: ${process.env.APP_URL || "http://localhost:5173"}/dashboard

---
This is an automated notification from ${process.env.APP_NAME || "WhatsApp SaaS"}
    `.trim();
  }

  /**
   * Send subscription expiration notification
   *
   * @param {string} organizationId - Organization ID
   * @param {Object} subscriptionData - Subscription details
   */
  async sendSubscriptionExpirationAlert(organizationId, subscriptionData) {
    try {
      const organization = await Organization.findByPk(organizationId);
      if (!organization) return;

      const admins = await User.findAll({
        where: { organizationId, role: ["admin", "owner"] },
      });

      const subject = `⚠️ Subscription Expiring Soon - ${organization.name}`;
      const html = this.getSubscriptionExpirationHtml(organization, subscriptionData);
      const text = this.getSubscriptionExpirationText(organization, subscriptionData);

      const emailPromises = admins.map((admin) =>
        this.sendEmail(admin.email, subject, html, text)
      );

      await Promise.allSettled(emailPromises);

      logger.info(`📧 Subscription expiration alert sent for organization ${organizationId}`);
    } catch (error) {
      logger.error(`❌ Failed to send subscription expiration alert:`, error);
    }
  }

  /**
   * Get subscription expiration email HTML
   */
  getSubscriptionExpirationHtml(organization, subscriptionData) {
    const { expiresAt, daysRemaining, planName } = subscriptionData;

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Subscription Expiring</title>
</head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #fee2e2; border-left: 4px solid #ef4444; padding: 20px; border-radius: 8px;">
    <h2 style="color: #dc2626; margin-top: 0;">⚠️ Subscription Expiring Soon</h2>
    <p>Hello ${organization.name} team,</p>
    <p>Your <strong>${planName}</strong> subscription will expire in <strong>${daysRemaining} days</strong>.</p>
    <p>Expiration Date: <strong>${new Date(expiresAt).toLocaleDateString()}</strong></p>
    <p>To avoid service interruption, please renew your subscription before it expires.</p>
    <a href="${process.env.APP_URL || "http://localhost:5173"}/subscription" 
       style="display: inline-block; background: #ef4444; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; margin-top: 15px;">
      Renew Subscription
    </a>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Get subscription expiration plain text
   */
  getSubscriptionExpirationText(organization, subscriptionData) {
    const { expiresAt, daysRemaining, planName } = subscriptionData;

    return `
SUBSCRIPTION EXPIRING SOON

Hello ${organization.name} team,

Your ${planName} subscription will expire in ${daysRemaining} days.
Expiration Date: ${new Date(expiresAt).toLocaleDateString()}

To avoid service interruption, please renew your subscription before it expires.

Renew: ${process.env.APP_URL || "http://localhost:5173"}/subscription
    `.trim();
  }
}

// Export singleton instance
module.exports = new NotificationService();
