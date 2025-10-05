const { Op } = require('sequelize');
const BlastSession = require('../models/blastSessionModel');
const BlastMessage = require('../models/blastMessageModel');
const logger = require('../utils/logger');

/**
 * Analytics Service for Blast Sessions
 * Provides advanced analytics and insights for blast campaigns
 */
class AnalyticsService {

  /**
   * Get comprehensive analytics for a blast session
   * @param {string} sessionId - Blast session ID
   * @param {number} userId - User ID for authorization
   * @returns {object} Analytics data
   */
  static async getSessionAnalytics(sessionId, userId) {
    try {
      // Verify session ownership
      const session = await BlastSession.findOne({
        where: { sessionId, userId }
      });

      if (!session) {
        throw new Error('Session not found or access denied');
      }

      // Get all messages for this session
      const messages = await BlastMessage.findAll({
        where: { sessionId },
        order: [['messageIndex', 'ASC']]
      });

      if (messages.length === 0) {
        return this.getEmptyAnalytics(sessionId);
      }

      const analytics = {
        sessionId,
        sessionInfo: {
          campaignName: session.campaignName,
          status: session.status,
          createdAt: session.createdAt,
          startedAt: session.startedAt,
          completedAt: session.completedAt,
          totalMessages: session.totalMessages,
        },
        overview: this.calculateOverview(messages),
        hourlyTrends: this.calculateHourlyTrends(messages),
        errorDistribution: this.calculateErrorDistribution(messages),
        retryAnalysis: this.calculateRetryAnalysis(messages),
        operatorAnalysis: this.calculateOperatorAnalysis(messages),
        timeAnalysis: this.calculateTimeAnalysis(messages),
        performanceMetrics: this.calculatePerformanceMetrics(messages, session),
        predictions: this.generatePredictions(messages),
        lastUpdated: new Date(),
      };

      logger.info(`📊 Analytics generated for session ${sessionId}: ${messages.length} messages processed`);
      return analytics;

    } catch (error) {
      logger.error(`❌ Failed to generate analytics for session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Calculate overview statistics
   * @param {array} messages - Array of blast messages
   * @returns {object} Overview statistics
   */
  static calculateOverview(messages) {
    const total = messages.length;
    const sent = messages.filter(m => m.status === 'sent').length;
    const failed = messages.filter(m => m.status === 'failed').length;
    const pending = messages.filter(m => m.status === 'pending').length;
    const skipped = messages.filter(m => m.status === 'skipped').length;

    const successRate = total > 0 ? (sent / total) * 100 : 0;
    const failureRate = total > 0 ? (failed / total) * 100 : 0;

    return {
      total,
      sent,
      failed,
      pending,
      skipped,
      successRate: Math.round(successRate * 100) / 100,
      failureRate: Math.round(failureRate * 100) / 100,
      completionRate: total > 0 ? ((sent + failed + skipped) / total) * 100 : 0,
    };
  }

  /**
   * Calculate hourly trends for the last 24 hours
   * @param {array} messages - Array of blast messages
   * @returns {array} Hourly trend data
   */
  static calculateHourlyTrends(messages) {
    const trends = Array(24).fill(0).map((_, hour) => ({
      hour: hour.toString().padStart(2, '0') + ':00',
      sent: 0,
      failed: 0,
      total: 0,
      successRate: 0,
    }));

    messages.forEach(message => {
      const sentAt = message.sentAt || message.updatedAt;
      if (sentAt) {
        const hour = new Date(sentAt).getHours();
        trends[hour].total++;
        
        if (message.status === 'sent') {
          trends[hour].sent++;
        } else if (message.status === 'failed') {
          trends[hour].failed++;
        }
      }
    });

    // Calculate success rates
    trends.forEach(trend => {
      trend.successRate = trend.total > 0 ? 
        Math.round((trend.sent / trend.total) * 10000) / 100 : 0;
    });

    return trends;
  }

  /**
   * Calculate error distribution with categorization
   * @param {array} messages - Array of blast messages
   * @returns {array} Error distribution data
   */
  static calculateErrorDistribution(messages) {
    const failedMessages = messages.filter(m => m.status === 'failed');
    const errorCategories = {};

    failedMessages.forEach(message => {
      const category = this.categorizeError(message.errorMessage);
      errorCategories[category] = errorCategories[category] || {
        category,
        count: 0,
        percentage: 0,
        examples: [],
      };
      
      errorCategories[category].count++;
      
      // Add unique error examples (max 3)
      if (errorCategories[category].examples.length < 3) {
        const error = message.errorMessage || 'Unknown error';
        if (!errorCategories[category].examples.includes(error)) {
          errorCategories[category].examples.push(error);
        }
      }
    });

    // Calculate percentages
    const totalErrors = failedMessages.length;
    Object.values(errorCategories).forEach(category => {
      category.percentage = totalErrors > 0 ? 
        Math.round((category.count / totalErrors) * 10000) / 100 : 0;
    });

    return Object.values(errorCategories).sort((a, b) => b.count - a.count);
  }

  /**
   * Calculate retry analysis
   * @param {array} messages - Array of blast messages
   * @returns {object} Retry analysis data
   */
  static calculateRetryAnalysis(messages) {
    const retriedMessages = messages.filter(m => (m.retryCount || 0) > 0);
    const maxRetriesReached = messages.filter(m => (m.retryCount || 0) >= 3);
    
    let totalRetries = 0;
    let successfulRetries = 0;
    let retryDistribution = { 1: 0, 2: 0, 3: 0, '3+': 0 };

    retriedMessages.forEach(message => {
      const retryCount = message.retryCount || 0;
      totalRetries += retryCount;
      
      if (message.status === 'sent' && retryCount > 0) {
        successfulRetries++;
      }

      // Count retry distribution
      if (retryCount === 1) retryDistribution[1]++;
      else if (retryCount === 2) retryDistribution[2]++;
      else if (retryCount === 3) retryDistribution[3]++;
      else if (retryCount > 3) retryDistribution['3+']++;
    });

    const retrySuccessRate = retriedMessages.length > 0 ? 
      (successfulRetries / retriedMessages.length) * 100 : 0;

    return {
      totalRetries,
      retriedMessages: retriedMessages.length,
      successfulRetries,
      maxRetriesReached: maxRetriesReached.length,
      retrySuccessRate: Math.round(retrySuccessRate * 100) / 100,
      retryDistribution,
      averageRetriesPerMessage: retriedMessages.length > 0 ? 
        totalRetries / retriedMessages.length : 0,
    };
  }

  /**
   * Calculate operator analysis (based on phone number patterns)
   * @param {array} messages - Array of blast messages
   * @returns {object} Operator analysis data
   */
  static calculateOperatorAnalysis(messages) {
    const operators = {};

    messages.forEach(message => {
      const operator = this.detectOperator(message.phone);
      operators[operator] = operators[operator] || {
        operator,
        total: 0,
        sent: 0,
        failed: 0,
        successRate: 0,
      };

      operators[operator].total++;
      if (message.status === 'sent') {
        operators[operator].sent++;
      } else if (message.status === 'failed') {
        operators[operator].failed++;
      }
    });

    // Calculate success rates
    Object.values(operators).forEach(op => {
      op.successRate = op.total > 0 ? 
        Math.round((op.sent / op.total) * 10000) / 100 : 0;
    });

    return Object.values(operators).sort((a, b) => b.total - a.total);
  }

  /**
   * Calculate time-based analysis
   * @param {array} messages - Array of blast messages
   * @returns {object} Time analysis data
   */
  static calculateTimeAnalysis(messages) {
    const sentMessages = messages.filter(m => m.status === 'sent' && m.sentAt);
    
    if (sentMessages.length === 0) {
      return { avgDeliveryTime: 0, fastestDelivery: 0, slowestDelivery: 0 };
    }

    const deliveryTimes = sentMessages.map(message => {
      const sent = new Date(message.sentAt);
      const created = new Date(message.createdAt);
      return sent - created; // Time in milliseconds
    });

    const avgDeliveryTime = deliveryTimes.reduce((a, b) => a + b, 0) / deliveryTimes.length;
    const fastestDelivery = Math.min(...deliveryTimes);
    const slowestDelivery = Math.max(...deliveryTimes);

    return {
      avgDeliveryTime: Math.round(avgDeliveryTime / 1000), // Convert to seconds
      fastestDelivery: Math.round(fastestDelivery / 1000),
      slowestDelivery: Math.round(slowestDelivery / 1000),
      totalDeliveredMessages: sentMessages.length,
    };
  }

  /**
   * Calculate performance metrics
   * @param {array} messages - Array of blast messages
   * @param {object} session - Blast session data
   * @returns {object} Performance metrics
   */
  static calculatePerformanceMetrics(messages, session) {
    const sessionStart = session.startedAt ? new Date(session.startedAt) : new Date(session.createdAt);
    const sessionEnd = session.completedAt ? new Date(session.completedAt) : new Date();
    const sessionDuration = sessionEnd - sessionStart; // milliseconds

    const sentMessages = messages.filter(m => m.status === 'sent');
    const messagesPerHour = sessionDuration > 0 ? 
      (sentMessages.length / (sessionDuration / (1000 * 60 * 60))) : 0;

    return {
      sessionDuration: Math.round(sessionDuration / 1000), // seconds
      messagesPerHour: Math.round(messagesPerHour * 100) / 100,
      messagesPerMinute: Math.round((messagesPerHour / 60) * 100) / 100,
      efficiency: messages.length > 0 ? 
        Math.round((sentMessages.length / messages.length) * 10000) / 100 : 0,
    };
  }

  /**
   * Generate predictions based on current data
   * @param {array} messages - Array of blast messages
   * @returns {object} Prediction data
   */
  static generatePredictions(messages) {
    const total = messages.length;
    const completed = messages.filter(m => ['sent', 'failed', 'skipped'].includes(m.status)).length;
    const pending = total - completed;

    if (pending === 0) {
      return { estimatedCompletion: null, projectedSuccessRate: null };
    }

    const currentSuccessRate = completed > 0 ? 
      (messages.filter(m => m.status === 'sent').length / completed) * 100 : 0;

    // Simple prediction based on current success rate
    const projectedSuccessful = Math.round(pending * (currentSuccessRate / 100));
    const projectedSuccessRate = total > 0 ? 
      ((messages.filter(m => m.status === 'sent').length + projectedSuccessful) / total) * 100 : 0;

    return {
      pendingMessages: pending,
      projectedSuccessful,
      projectedSuccessRate: Math.round(projectedSuccessRate * 100) / 100,
      estimatedCompletion: new Date(Date.now() + (pending * 2000)), // 2 seconds per message estimate
    };
  }

  /**
   * Categorize error messages
   * @param {string} errorMessage - Error message to categorize
   * @returns {string} Error category
   */
  static categorizeError(errorMessage) {
    if (!errorMessage) return 'Unknown';
    
    const message = errorMessage.toLowerCase();
    
    if (message.includes('timeout')) return 'Timeout';
    if (message.includes('network') || message.includes('connection')) return 'Network';
    if (message.includes('invalid') || message.includes('format')) return 'Invalid Number';
    if (message.includes('blocked') || message.includes('banned')) return 'Account Issues';
    if (message.includes('rate') || message.includes('limit')) return 'Rate Limit';
    if (message.includes('whatsapp')) return 'WhatsApp Error';
    if (message.includes('quota') || message.includes('exceeded')) return 'Quota Exceeded';
    if (message.includes('permission') || message.includes('unauthorized')) return 'Permission';
    
    return 'Other';
  }

  /**
   * Detect operator from phone number
   * @param {string} phone - Phone number
   * @returns {string} Operator name
   */
  static detectOperator(phone) {
    if (!phone) return 'Unknown';
    
    const cleaned = phone.replace(/\D/g, '');
    let prefix = '';
    
    if (cleaned.startsWith('62')) {
      prefix = cleaned.substring(2, 5);
    } else if (cleaned.startsWith('08')) {
      prefix = cleaned.substring(2, 5);
    } else if (cleaned.startsWith('8')) {
      prefix = cleaned.substring(1, 4);
    }

    const operatorPrefixes = {
      TELKOMSEL: ['811', '812', '813', '821', '822', '852', '853'],
      INDOSAT: ['814', '815', '816', '855', '856', '857', '858'],
      XL: ['817', '818', '819', '859', '877', '878'],
      SMARTFREN: ['881', '882', '883', '884', '885', '886', '887', '888', '889'],
      THREE: ['895', '896', '897', '898', '899'],
      AXIS: ['831', '832', '833', '838'],
    };

    for (const [operator, prefixes] of Object.entries(operatorPrefixes)) {
      if (prefixes.includes(prefix)) {
        return operator;
      }
    }

    return 'Unknown';
  }

  /**
   * Get empty analytics structure
   * @param {string} sessionId - Session ID
   * @returns {object} Empty analytics data
   */
  static getEmptyAnalytics(sessionId) {
    return {
      sessionId,
      overview: { total: 0, sent: 0, failed: 0, pending: 0, skipped: 0, successRate: 0, failureRate: 0 },
      hourlyTrends: Array(24).fill(0).map((_, hour) => ({
        hour: hour.toString().padStart(2, '0') + ':00',
        sent: 0, failed: 0, total: 0, successRate: 0
      })),
      errorDistribution: [],
      retryAnalysis: { totalRetries: 0, retriedMessages: 0, successfulRetries: 0, retrySuccessRate: 0 },
      operatorAnalysis: [],
      timeAnalysis: { avgDeliveryTime: 0, fastestDelivery: 0, slowestDelivery: 0 },
      performanceMetrics: { sessionDuration: 0, messagesPerHour: 0, efficiency: 0 },
      predictions: { pendingMessages: 0, projectedSuccessRate: 0 },
      lastUpdated: new Date(),
    };
  }

  /**
   * Get analytics for multiple sessions (dashboard overview)
   * @param {number} userId - User ID
   * @param {number} limit - Number of sessions to analyze
   * @returns {object} Multi-session analytics
   */
  static async getDashboardAnalytics(userId, limit = 10) {
    try {
      const sessions = await BlastSession.findAll({
        where: { userId },
        order: [['createdAt', 'DESC']],
        limit,
      });

      const analytics = {
        totalSessions: sessions.length,
        totalMessages: 0,
        totalSent: 0,
        totalFailed: 0,
        averageSuccessRate: 0,
        sessionsSummary: [],
        trends: {
          daily: [],
          monthly: [],
        },
        lastUpdated: new Date(),
      };

      for (const session of sessions) {
        const sessionAnalytics = await this.getSessionAnalytics(session.sessionId, userId);
        
        analytics.totalMessages += sessionAnalytics.overview.total;
        analytics.totalSent += sessionAnalytics.overview.sent;
        analytics.totalFailed += sessionAnalytics.overview.failed;
        
        analytics.sessionsSummary.push({
          sessionId: session.sessionId,
          campaignName: session.campaignName,
          status: session.status,
          createdAt: session.createdAt,
          overview: sessionAnalytics.overview,
        });
      }

      analytics.averageSuccessRate = analytics.totalMessages > 0 ? 
        (analytics.totalSent / analytics.totalMessages) * 100 : 0;

      logger.info(`📈 Dashboard analytics generated for user ${userId}: ${analytics.totalSessions} sessions analyzed`);
      return analytics;

    } catch (error) {
      logger.error(`❌ Failed to generate dashboard analytics for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Export analytics data to CSV
   * @param {object} analytics - Analytics data
   * @returns {string} CSV content
   */
  static exportAnalyticsToCSV(analytics) {
    const headers = [
      'Metric',
      'Value',
      'Description'
    ];

    const rows = [
      ['Session ID', analytics.sessionId, 'Blast session identifier'],
      ['Total Messages', analytics.overview.total, 'Total number of messages'],
      ['Sent Messages', analytics.overview.sent, 'Successfully sent messages'],
      ['Failed Messages', analytics.overview.failed, 'Failed to send messages'],
      ['Success Rate (%)', analytics.overview.successRate, 'Percentage of successful deliveries'],
      ['Total Retries', analytics.retryAnalysis.totalRetries, 'Total retry attempts'],
      ['Retry Success Rate (%)', analytics.retryAnalysis.retrySuccessRate, 'Percentage of successful retries'],
      ['Average Delivery Time (s)', analytics.timeAnalysis.avgDeliveryTime, 'Average time to deliver message'],
      ['Messages Per Hour', analytics.performanceMetrics.messagesPerHour, 'Delivery rate per hour'],
      ['Session Duration (s)', analytics.performanceMetrics.sessionDuration, 'Total session duration'],
    ];

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    return csvContent;
  }

  /**
   * Compare multiple campaigns (MongoDB version)
   * @param {Array<string>} sessionIds - Array of MongoDB session IDs
   * @returns {object} Comparison data
   */
  static async compareCampaignsMongo(sessionIds) {
    try {
      if (!Array.isArray(sessionIds) || sessionIds.length < 2) {
        throw new Error('At least 2 campaigns required for comparison');
      }

      if (sessionIds.length > 5) {
        throw new Error('Maximum 5 campaigns can be compared at once');
      }

      const campaigns = [];

      for (const sessionId of sessionIds) {
        const session = await BlastSession.findById(sessionId);
        if (!session) continue;

        const messages = await BlastMessage.find({ blastSessionId: sessionId });
        
        const total = messages.length;
        const sent = messages.filter(m => m.status === 'sent').length;
        const failed = messages.filter(m => m.status === 'failed').length;
        const successRate = total > 0 ? (sent / total) * 100 : 0;

        campaigns.push({
          sessionId: sessionId.toString(),
          name: session.name || 'Unnamed Campaign',
          createdAt: session.createdAt,
          metrics: {
            total,
            sent,
            failed,
            successRate: parseFloat(successRate.toFixed(2)),
          },
        });
      }

      // Find best campaign
      const bestCampaign = campaigns.reduce((best, current) => {
        return current.metrics.successRate > best.metrics.successRate ? current : best;
      }, campaigns[0]);

      return {
        campaigns,
        bestCampaign: bestCampaign.sessionId,
        comparisonDate: new Date(),
      };
    } catch (error) {
      logger.error('Error comparing campaigns:', error);
      throw error;
    }
  }

  /**
   * Analyze best time to send based on historical MongoDB data
   * @param {string} accountSessionId - WhatsApp session ID
   * @param {number} days - Number of days to analyze
   * @returns {object} Best time analysis
   */
  static async analyzeBestTimeMongo(accountSessionId, days = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const sessions = await BlastSession.find({
        sessionId: accountSessionId,
        createdAt: { $gte: startDate },
      });

      if (sessions.length === 0) {
        return {
          message: 'No historical data available',
          recommendation: 'Send at least 5 campaigns to get personalized recommendations',
        };
      }

      const sessionIds = sessions.map(s => s._id);
      const messages = await BlastMessage.find({
        blastSessionId: { $in: sessionIds },
      });

      // Hourly analysis
      const hourlyData = {};
      for (let i = 0; i < 24; i++) {
        hourlyData[i] = { total: 0, sent: 0, failed: 0 };
      }

      messages.forEach(msg => {
        if (msg.sentAt) {
          const hour = new Date(msg.sentAt).getHours();
          hourlyData[hour].total++;
          if (msg.status === 'sent') hourlyData[hour].sent++;
          if (msg.status === 'failed') hourlyData[hour].failed++;
        }
      });

      const hourlyAnalysis = Object.entries(hourlyData).map(([hour, data]) => ({
        hour: parseInt(hour),
        total: data.total,
        sent: data.sent,
        successRate: data.total > 0 ? parseFloat(((data.sent / data.total) * 100).toFixed(2)) : 0,
      }));

      // Find best hours (minimum 20 messages)
      const bestHours = hourlyAnalysis
        .filter(h => h.total >= 20)
        .sort((a, b) => b.successRate - a.successRate)
        .slice(0, 5);

      // Day of week analysis
      const dayData = {};
      for (let i = 0; i < 7; i++) {
        dayData[i] = { total: 0, sent: 0 };
      }

      messages.forEach(msg => {
        if (msg.sentAt) {
          const day = new Date(msg.sentAt).getDay();
          dayData[day].total++;
          if (msg.status === 'sent') dayData[day].sent++;
        }
      });

      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayAnalysis = Object.entries(dayData).map(([day, data]) => ({
        day: parseInt(day),
        dayName: dayNames[day],
        total: data.total,
        successRate: data.total > 0 ? parseFloat(((data.sent / data.total) * 100).toFixed(2)) : 0,
      }));

      const bestDays = dayAnalysis
        .filter(d => d.total >= 50)
        .sort((a, b) => b.successRate - a.successRate)
        .slice(0, 3);

      // Recommendations
      const recommendations = [];
      if (bestHours.length > 0) {
        recommendations.push({
          type: 'best_hour',
          message: `Best time: ${bestHours[0].hour}:00 - ${bestHours[0].hour + 1}:00`,
          successRate: bestHours[0].successRate,
        });
      }

      if (bestDays.length > 0) {
        recommendations.push({
          type: 'best_day',
          message: `Best day: ${bestDays[0].dayName}`,
          successRate: bestDays[0].successRate,
        });
      }

      return {
        accountSessionId,
        daysAnalyzed: days,
        totalMessages: messages.length,
        hourlyAnalysis,
        dayAnalysis,
        bestHours,
        bestDays,
        recommendations,
        generatedAt: new Date(),
      };
    } catch (error) {
      logger.error('Error analyzing best time:', error);
      throw error;
    }
  }
}

module.exports = AnalyticsService;
