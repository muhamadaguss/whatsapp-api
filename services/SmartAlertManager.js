/**
 * SmartAlertManager Service
 * 
 * Intelligent alert system that provides:
 * - Predictive analysis for connection issues
 * - Automated escalation procedures
 * - Custom alert rules configuration
 * - Multi-channel notifications (email, SMS, webhook)
 * - Pattern recognition for proactive alerts
 * 
 * @author WhatsApp Enhancement Team
 * @version 1.0.0
 * @created September 17, 2025
 */

const EventEmitter = require('events');
const nodemailer = require('nodemailer');
const axios = require('axios');

class SmartAlertManager extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      // Alert thresholds
      healthScoreThresholds: {
        critical: 20,
        warning: 50,
        info: 70
      },
      
      // Escalation timing (in minutes)
      escalationIntervals: {
        level1: 5,    // First escalation after 5 minutes
        level2: 15,   // Second escalation after 15 minutes
        level3: 30    // Final escalation after 30 minutes
      },
      
      // Notification channels
      notifications: {
        email: options.email || process.env.SMTP_ENABLED === 'true',
        webhook: options.webhook || process.env.WEBHOOK_ENABLED === 'true',
        socket: options.socket !== false // Default enabled
      },
      
      // Predictive analysis settings
      prediction: {
        enabled: options.predictiveAnalysis !== false,
        lookbackPeriod: 60, // minutes
        patternThreshold: 3, // minimum occurrences to trigger prediction
        confidenceLevel: 0.7 // minimum confidence to send predictive alert
      },
      
      ...options
    };
    
    // Alert state tracking
    this.activeAlerts = new Map();
    this.alertHistory = [];
    this.escalationTimers = new Map();
    this.patterns = new Map();
    
    // Email configuration
    this.emailTransporter = null;
    this.initializeEmailTransporter();
    
    // Initialize pattern analysis
    this.initializePatternAnalysis();
    
    console.log('📊 SmartAlertManager initialized with options:', {
      notifications: this.options.notifications,
      prediction: this.options.prediction.enabled,
      thresholds: this.options.healthScoreThresholds
    });
  }

  /**
   * Initialize email transporter for notifications
   */
  initializeEmailTransporter() {
    if (!this.options.notifications.email) return;
    
    try {
      this.emailTransporter = nodemailer.createTransporter({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });
      
      console.log('📧 Email transporter initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize email transporter:', error.message);
      this.options.notifications.email = false;
    }
  }

  /**
   * Initialize pattern analysis for predictive alerts
   */
  initializePatternAnalysis() {
    if (!this.options.prediction.enabled) return;
    
    // Start pattern analysis interval
    setInterval(() => {
      this.analyzePatterns();
    }, 5 * 60 * 1000); // Every 5 minutes
    
    console.log('🔮 Pattern analysis initialized for predictive alerts');
  }

  /**
   * Process account status update and determine if alerts are needed
   * @param {Object} statusUpdate - Status update from WhatsAppStatusMonitor
   */
  async processStatusUpdate(statusUpdate) {
    try {
      const {
        sessionId,
        status,
        healthScore,
        connectionQuality,
        metadata,
        timestamp = new Date()
      } = statusUpdate;

      // Store status for pattern analysis
      this.recordStatusForPatterns(statusUpdate);

      // Determine alert level based on status and health score
      const alertLevel = this.determineAlertLevel(status, healthScore, connectionQuality);
      
      if (alertLevel) {
        await this.createAlert({
          sessionId,
          level: alertLevel,
          status,
          healthScore,
          connectionQuality,
          metadata,
          timestamp,
          type: 'status_alert'
        });
      }

      // Check for existing alerts that might need updating or clearing
      await this.updateExistingAlerts(sessionId, status, healthScore);

    } catch (error) {
      console.error('❌ Error processing status update in SmartAlertManager:', error);
    }
  }

  /**
   * Record status update for pattern analysis
   * @param {Object} statusUpdate 
   */
  recordStatusForPatterns(statusUpdate) {
    if (!this.options.prediction.enabled) return;

    const { sessionId, status, healthScore, timestamp = new Date() } = statusUpdate;
    
    if (!this.patterns.has(sessionId)) {
      this.patterns.set(sessionId, []);
    }
    
    const sessionPatterns = this.patterns.get(sessionId);
    sessionPatterns.push({
      status,
      healthScore,
      timestamp
    });
    
    // Keep only recent data for pattern analysis
    const cutoffTime = new Date(Date.now() - (this.options.prediction.lookbackPeriod * 60 * 1000));
    this.patterns.set(sessionId, sessionPatterns.filter(p => p.timestamp > cutoffTime));
  }

  /**
   * Determine alert level based on status and metrics
   * @param {string} status 
   * @param {number} healthScore 
   * @param {string} connectionQuality 
   * @returns {string|null} Alert level or null if no alert needed
   */
  determineAlertLevel(status, healthScore, connectionQuality) {
    // Critical alerts
    if (status === 'blocked' || status === 'error' || healthScore <= this.options.healthScoreThresholds.critical) {
      return 'critical';
    }
    
    // Warning alerts
    if (status === 'disconnected' || 
        connectionQuality === 'poor' || 
        healthScore <= this.options.healthScoreThresholds.warning) {
      return 'warning';
    }
    
    // Info alerts
    if (connectionQuality === 'fair' || healthScore <= this.options.healthScoreThresholds.info) {
      return 'info';
    }
    
    return null;
  }

  /**
   * Create new alert with escalation logic
   * @param {Object} alertData 
   */
  async createAlert(alertData) {
    const alertId = `${alertData.sessionId}_${alertData.level}_${Date.now()}`;
    
    const alert = {
      id: alertId,
      ...alertData,
      createdAt: new Date(),
      escalationLevel: 0,
      acknowledged: false,
      resolved: false
    };

    // Check if similar alert already exists and is active
    const existingAlert = this.findActiveAlert(alertData.sessionId, alertData.level);
    if (existingAlert) {
      console.log(`⚠️ Similar alert already exists for session ${alertData.sessionId}, level ${alertData.level}`);
      return existingAlert;
    }

    // Store active alert
    this.activeAlerts.set(alertId, alert);
    this.alertHistory.push(alert);

    console.log(`🚨 Created ${alertData.level} alert for session ${alertData.sessionId}:`, {
      alertId,
      status: alertData.status,
      healthScore: alertData.healthScore
    });

    // Send immediate notifications
    await this.sendNotifications(alert);

    // Setup escalation if needed
    if (alertData.level === 'critical' || alertData.level === 'warning') {
      this.setupEscalation(alert);
    }

    // Emit alert event
    this.emit('alert_created', alert);

    return alert;
  }

  /**
   * Find existing active alert for session and level
   * @param {string} sessionId 
   * @param {string} level 
   * @returns {Object|null}
   */
  findActiveAlert(sessionId, level) {
    for (const [alertId, alert] of this.activeAlerts) {
      if (alert.sessionId === sessionId && 
          alert.level === level && 
          !alert.resolved && 
          !alert.acknowledged) {
        return alert;
      }
    }
    return null;
  }

  /**
   * Update existing alerts based on new status
   * @param {string} sessionId 
   * @param {string} status 
   * @param {number} healthScore 
   */
  async updateExistingAlerts(sessionId, status, healthScore) {
    const sessionAlerts = Array.from(this.activeAlerts.values())
      .filter(alert => alert.sessionId === sessionId && !alert.resolved);

    for (const alert of sessionAlerts) {
      // Auto-resolve alerts if conditions improve
      if (status === 'connected' && healthScore > 80) {
        await this.resolveAlert(alert.id, 'auto_resolved', 'Conditions improved automatically');
      }
    }
  }

  /**
   * Setup escalation timer for alert
   * @param {Object} alert 
   */
  setupEscalation(alert) {
    const escalateAfter = alert.level === 'critical' 
      ? this.options.escalationIntervals.level1 
      : this.options.escalationIntervals.level2;

    const timer = setTimeout(async () => {
      await this.escalateAlert(alert.id);
    }, escalateAfter * 60 * 1000);

    this.escalationTimers.set(alert.id, timer);
  }

  /**
   * Escalate alert to next level
   * @param {string} alertId 
   */
  async escalateAlert(alertId) {
    const alert = this.activeAlerts.get(alertId);
    if (!alert || alert.resolved || alert.acknowledged) {
      return;
    }

    alert.escalationLevel += 1;
    alert.lastEscalated = new Date();

    console.log(`🔺 Escalating alert ${alertId} to level ${alert.escalationLevel}`);

    // Send escalated notifications
    await this.sendNotifications(alert, true);

    // Setup next escalation if not at max level
    if (alert.escalationLevel < 3) {
      this.setupEscalation(alert);
    }

    this.emit('alert_escalated', alert);
  }

  /**
   * Send notifications for alert through configured channels
   * @param {Object} alert 
   * @param {boolean} isEscalation 
   */
  async sendNotifications(alert, isEscalation = false) {
    const notificationData = {
      alert,
      isEscalation,
      timestamp: new Date(),
      escalationLevel: alert.escalationLevel
    };

    // Send Socket.IO notification
    if (this.options.notifications.socket) {
      this.emit('socket_notification', {
        type: 'smart_alert',
        data: notificationData
      });
    }

    // Send email notification
    if (this.options.notifications.email && this.emailTransporter) {
      await this.sendEmailNotification(notificationData);
    }

    // Send webhook notification
    if (this.options.notifications.webhook) {
      await this.sendWebhookNotification(notificationData);
    }
  }

  /**
   * Send email notification
   * @param {Object} notificationData 
   */
  async sendEmailNotification(notificationData) {
    try {
      const { alert, isEscalation } = notificationData;
      
      const subject = `${isEscalation ? 'ESCALATED ' : ''}WhatsApp Alert: ${alert.level.toUpperCase()} - Session ${alert.sessionId}`;
      
      const html = this.generateEmailTemplate(notificationData);
      
      await this.emailTransporter.sendMail({
        from: process.env.SMTP_FROM || 'whatsapp-alerts@yourcompany.com',
        to: process.env.ALERT_EMAIL_RECIPIENTS,
        subject,
        html
      });

      console.log(`📧 Email notification sent for alert ${alert.id}`);
    } catch (error) {
      console.error('❌ Failed to send email notification:', error.message);
    }
  }

  /**
   * Generate email template for alert
   * @param {Object} notificationData 
   * @returns {string} HTML email content
   */
  generateEmailTemplate(notificationData) {
    const { alert, isEscalation } = notificationData;
    
    const levelColors = {
      critical: '#dc2626',
      warning: '#f59e0b', 
      info: '#3b82f6'
    };

    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: ${levelColors[alert.level]}; color: white; padding: 20px; text-align: center;">
          <h1>${isEscalation ? '🔺 ESCALATED ALERT' : '🚨 ALERT'}</h1>
          <h2>${alert.level.toUpperCase()}</h2>
        </div>
        
        <div style="padding: 20px; background: #f9fafb;">
          <h3>WhatsApp Session Alert</h3>
          
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Session ID:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${alert.sessionId}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Status:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${alert.status}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Health Score:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${alert.healthScore}/100</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Connection Quality:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${alert.connectionQuality}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Created:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${alert.createdAt.toLocaleString()}</td></tr>
            ${isEscalation ? `<tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Escalation Level:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${alert.escalationLevel}</td></tr>` : ''}
          </table>
          
          ${alert.metadata ? `
            <h4>Additional Information:</h4>
            <pre style="background: #f3f4f6; padding: 10px; border-radius: 4px; overflow-x: auto;">${JSON.stringify(alert.metadata, null, 2)}</pre>
          ` : ''}
          
          <div style="margin-top: 20px; text-align: center;">
            <a href="${process.env.FRONTEND_URL}/blast-control" style="background: #3b82f6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">View Dashboard</a>
          </div>
        </div>
        
        <div style="padding: 10px; background: #e5e7eb; text-align: center; font-size: 12px; color: #6b7280;">
          WhatsApp Blast Monitoring System - Automated Alert
        </div>
      </div>
    `;
  }

  /**
   * Send webhook notification
   * @param {Object} notificationData 
   */
  async sendWebhookNotification(notificationData) {
    try {
      const webhookUrl = process.env.ALERT_WEBHOOK_URL;
      if (!webhookUrl) return;

      const payload = {
        event: 'whatsapp_alert',
        timestamp: new Date().toISOString(),
        data: notificationData
      };

      await axios.post(webhookUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Source': 'whatsapp-smart-alerts'
        },
        timeout: 10000
      });

      console.log(`🔗 Webhook notification sent for alert ${notificationData.alert.id}`);
    } catch (error) {
      console.error('❌ Failed to send webhook notification:', error.message);
    }
  }

  /**
   * Analyze patterns for predictive alerts
   */
  async analyzePatterns() {
    if (!this.options.prediction.enabled) return;

    for (const [sessionId, patterns] of this.patterns) {
      try {
        await this.analyzeSessionPatterns(sessionId, patterns);
      } catch (error) {
        console.error(`❌ Error analyzing patterns for session ${sessionId}:`, error);
      }
    }
  }

  /**
   * Analyze patterns for specific session
   * @param {string} sessionId 
   * @param {Array} patterns 
   */
  async analyzeSessionPatterns(sessionId, patterns) {
    if (patterns.length < this.options.prediction.patternThreshold) return;

    // Analyze health score trend
    const healthTrend = this.analyzeHealthTrend(patterns);
    
    // Analyze connection stability
    const stabilityTrend = this.analyzeStabilityTrend(patterns);

    // Generate predictions
    if (healthTrend.confidence >= this.options.prediction.confidenceLevel) {
      await this.createPredictiveAlert(sessionId, 'health_decline', healthTrend);
    }

    if (stabilityTrend.confidence >= this.options.prediction.confidenceLevel) {
      await this.createPredictiveAlert(sessionId, 'stability_issue', stabilityTrend);
    }
  }

  /**
   * Analyze health score trend
   * @param {Array} patterns 
   * @returns {Object} Trend analysis result
   */
  analyzeHealthTrend(patterns) {
    const recentPatterns = patterns.slice(-10); // Last 10 data points
    const scores = recentPatterns.map(p => p.healthScore);
    
    // Calculate linear regression
    const n = scores.length;
    const sumX = n * (n - 1) / 2; // Sum of indices 0,1,2...n-1
    const sumY = scores.reduce((a, b) => a + b, 0);
    const sumXY = scores.reduce((sum, score, index) => sum + (index * score), 0);
    const sumX2 = n * (n - 1) * (2 * n - 1) / 6; // Sum of squares
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    // Calculate R-squared for confidence
    const yMean = sumY / n;
    const ssRes = scores.reduce((sum, score, index) => {
      const predicted = slope * index + intercept;
      return sum + Math.pow(score - predicted, 2);
    }, 0);
    const ssTot = scores.reduce((sum, score) => sum + Math.pow(score - yMean, 2), 0);
    const rSquared = 1 - (ssRes / ssTot);
    
    return {
      slope,
      confidence: Math.abs(rSquared),
      prediction: slope < -2 ? 'declining' : slope > 2 ? 'improving' : 'stable',
      projectedScore: slope * (n + 5) + intercept // Project 5 steps ahead
    };
  }

  /**
   * Analyze connection stability trend
   * @param {Array} patterns 
   * @returns {Object} Stability analysis result
   */
  analyzeStabilityTrend(patterns) {
    const recentPatterns = patterns.slice(-15); // Last 15 data points
    
    // Count connection state changes
    let disconnections = 0;
    let totalTime = 0;
    
    for (let i = 1; i < recentPatterns.length; i++) {
      const prev = recentPatterns[i - 1];
      const curr = recentPatterns[i];
      
      if (prev.status === 'connected' && curr.status !== 'connected') {
        disconnections++;
      }
      
      totalTime += curr.timestamp - prev.timestamp;
    }
    
    const avgTimeBetweenChecks = totalTime / (recentPatterns.length - 1);
    const disconnectionRate = disconnections / (totalTime / (60 * 1000)); // per minute
    
    return {
      disconnectionRate,
      confidence: disconnections >= 3 ? 0.8 : 0.3,
      prediction: disconnectionRate > 0.1 ? 'unstable' : 'stable'
    };
  }

  /**
   * Create predictive alert
   * @param {string} sessionId 
   * @param {string} type 
   * @param {Object} analysis 
   */
  async createPredictiveAlert(sessionId, type, analysis) {
    // Check if similar predictive alert was sent recently
    const recentPredictive = this.alertHistory
      .filter(alert => 
        alert.sessionId === sessionId && 
        alert.type === 'predictive' &&
        alert.subType === type &&
        (new Date() - alert.createdAt) < (30 * 60 * 1000) // Within 30 minutes
      );
    
    if (recentPredictive.length > 0) return;

    await this.createAlert({
      sessionId,
      level: 'info',
      status: 'predicted_issue',
      healthScore: analysis.projectedScore || 50,
      connectionQuality: 'predicted',
      metadata: {
        predictionType: type,
        confidence: analysis.confidence,
        analysis: analysis
      },
      timestamp: new Date(),
      type: 'predictive',
      subType: type
    });

    console.log(`🔮 Created predictive alert for session ${sessionId}, type: ${type}, confidence: ${analysis.confidence.toFixed(2)}`);
  }

  /**
   * Acknowledge alert
   * @param {string} alertId 
   * @param {string} userId 
   * @param {string} reason 
   */
  async acknowledgeAlert(alertId, userId, reason = null) {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) {
      throw new Error(`Alert ${alertId} not found`);
    }

    alert.acknowledged = true;
    alert.acknowledgedBy = userId;
    alert.acknowledgedAt = new Date();
    alert.acknowledgeReason = reason;

    // Cancel escalation timer
    const timer = this.escalationTimers.get(alertId);
    if (timer) {
      clearTimeout(timer);
      this.escalationTimers.delete(alertId);
    }

    console.log(`✅ Alert ${alertId} acknowledged by ${userId}`);
    this.emit('alert_acknowledged', alert);

    return alert;
  }

  /**
   * Resolve alert
   * @param {string} alertId 
   * @param {string} resolution 
   * @param {string} reason 
   */
  async resolveAlert(alertId, resolution = 'manual', reason = null) {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) {
      throw new Error(`Alert ${alertId} not found`);
    }

    alert.resolved = true;
    alert.resolution = resolution;
    alert.resolvedAt = new Date();
    alert.resolveReason = reason;

    // Cancel escalation timer
    const timer = this.escalationTimers.get(alertId);
    if (timer) {
      clearTimeout(timer);
      this.escalationTimers.delete(alertId);
    }

    // Remove from active alerts
    this.activeAlerts.delete(alertId);

    console.log(`✅ Alert ${alertId} resolved: ${resolution}`);
    this.emit('alert_resolved', alert);

    return alert;
  }

  /**
   * Get active alerts
   * @param {string} sessionId - Optional filter by session
   * @returns {Array} Active alerts
   */
  getActiveAlerts(sessionId = null) {
    const alerts = Array.from(this.activeAlerts.values());
    return sessionId ? alerts.filter(alert => alert.sessionId === sessionId) : alerts;
  }

  /**
   * Get alert history
   * @param {Object} filters - Optional filters
   * @returns {Array} Alert history
   */
  getAlertHistory(filters = {}) {
    let history = [...this.alertHistory];
    
    if (filters.sessionId) {
      history = history.filter(alert => alert.sessionId === filters.sessionId);
    }
    
    if (filters.level) {
      history = history.filter(alert => alert.level === filters.level);
    }
    
    if (filters.since) {
      history = history.filter(alert => alert.createdAt >= filters.since);
    }
    
    return history.sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Get alert statistics
   * @returns {Object} Alert statistics
   */
  getAlertStatistics() {
    const active = this.getActiveAlerts();
    const history = this.alertHistory;
    
    const last24h = history.filter(alert => 
      (new Date() - alert.createdAt) <= (24 * 60 * 60 * 1000)
    );
    
    return {
      activeAlerts: {
        total: active.length,
        critical: active.filter(a => a.level === 'critical').length,
        warning: active.filter(a => a.level === 'warning').length,
        info: active.filter(a => a.level === 'info').length
      },
      last24Hours: {
        total: last24h.length,
        resolved: last24h.filter(a => a.resolved).length,
        escalated: last24h.filter(a => a.escalationLevel > 0).length,
        predictive: last24h.filter(a => a.type === 'predictive').length
      },
      allTime: {
        total: history.length,
        avgResolutionTime: this.calculateAvgResolutionTime(history),
        topSessions: this.getTopAlertSessions(history)
      }
    };
  }

  /**
   * Calculate average resolution time for resolved alerts
   * @param {Array} alerts 
   * @returns {number} Average resolution time in minutes
   */
  calculateAvgResolutionTime(alerts) {
    const resolved = alerts.filter(alert => alert.resolved && alert.resolvedAt);
    
    if (resolved.length === 0) return 0;
    
    const totalTime = resolved.reduce((sum, alert) => {
      return sum + (alert.resolvedAt - alert.createdAt);
    }, 0);
    
    return Math.round(totalTime / resolved.length / (60 * 1000)); // Convert to minutes
  }

  /**
   * Get sessions with most alerts
   * @param {Array} alerts 
   * @returns {Array} Top alert sessions
   */
  getTopAlertSessions(alerts) {
    const sessionCounts = {};
    
    alerts.forEach(alert => {
      sessionCounts[alert.sessionId] = (sessionCounts[alert.sessionId] || 0) + 1;
    });
    
    return Object.entries(sessionCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([sessionId, count]) => ({ sessionId, alertCount: count }));
  }

  /**
   * Cleanup old data and timers
   */
  cleanup() {
    // Clear old patterns (older than 24 hours)
    const cutoffTime = new Date(Date.now() - (24 * 60 * 60 * 1000));
    
    for (const [sessionId, patterns] of this.patterns) {
      const filtered = patterns.filter(p => p.timestamp > cutoffTime);
      if (filtered.length === 0) {
        this.patterns.delete(sessionId);
      } else {
        this.patterns.set(sessionId, filtered);
      }
    }
    
    // Clear old alert history (keep only last 7 days)
    const historyKeepTime = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000));
    this.alertHistory = this.alertHistory.filter(alert => alert.createdAt > historyKeepTime);
    
    console.log('🧹 SmartAlertManager cleanup completed');
  }
}

module.exports = SmartAlertManager;