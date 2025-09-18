const EventEmitter = require("events");
const logger = require("../utils/logger");
const { getSocket } = require("../auth/socket");
const SessionModel = require("../models/sessionModel");

/**
 * WhatsApp Status Monitor Service
 * Handles real-time monitoring and status tracking for WhatsApp sessions
 */
class WhatsAppStatusMonitor extends EventEmitter {
  constructor() {
    super();
    this.statusCache = new Map();
    this.healthCheckInterval = 30000; // 30 seconds
    this.reconnectionAttempts = new Map();
    this.maxReconnectionAttempts = 3;
    this.healthCheckTimer = null;
    this.io = null; // Socket.IO instance
    
    logger.info("🔍 WhatsApp Status Monitor created");
  }

  /**
   * Initialize the monitor with Socket.IO instance
   */
  initialize(io) {
    try {
      this.io = io;
      this.startHealthCheckTimer();
      logger.info("🔍 WhatsApp Status Monitor initialized with Socket.IO");
      return true;
    } catch (error) {
      logger.error("❌ Failed to initialize WhatsApp Status Monitor:", error);
      throw error;
    }
  }

  /**
   * Track session status and emit real-time updates
   */
  async trackSession(sessionId, whatsappSessionId, status, metadata = {}) {
    try {
      const previousStatus = this.statusCache.get(sessionId);
      const timestamp = new Date();
      
      const statusData = {
        sessionId,
        whatsappSessionId,
        status,
        timestamp,
        connectionQuality: this.calculateConnectionQuality(metadata),
        lastSeen: timestamp,
        metadata: {
          ...metadata,
          previousStatus: previousStatus?.status,
          statusChangedAt: timestamp,
        }
      };

      // Update cache
      this.statusCache.set(sessionId, statusData);

      // Persist to database
      await this.persistStatusToDatabase(sessionId, statusData);

      // Emit real-time update if status changed
      if (!previousStatus || previousStatus.status !== status) {
        await this.emitStatusUpdate(sessionId, statusData);
        
        // Handle critical status changes
        await this.handleCriticalStatusChange(sessionId, status, previousStatus?.status);
      }

      // Update session health score
      await this.updateSessionHealthScore(sessionId, statusData);

      logger.info(`📊 Status tracked for session ${sessionId}: ${status}`);
      
    } catch (error) {
      logger.error(`❌ Failed to track session status for ${sessionId}:`, error);
    }
  }

  /**
   * Calculate connection quality based on metadata
   */
  calculateConnectionQuality(metadata) {
    try {
      const factors = {
        responseTime: metadata.responseTime || 1000,
        errorRate: metadata.errorRate || 0,
        uptime: metadata.uptime || 100,
        lastMessageDelay: metadata.lastMessageDelay || 0
      };

      // Calculate quality score (0-100)
      let score = 100;
      
      // Response time penalty
      if (factors.responseTime > 5000) score -= 30;
      else if (factors.responseTime > 2000) score -= 15;
      
      // Error rate penalty
      score -= factors.errorRate * 20;
      
      // Uptime bonus/penalty
      if (factors.uptime < 90) score -= 20;
      else if (factors.uptime > 98) score += 5;
      
      // Message delay penalty
      if (factors.lastMessageDelay > 10000) score -= 15;

      score = Math.max(0, Math.min(100, score));

      if (score >= 80) return 'excellent';
      if (score >= 60) return 'good';
      if (score >= 40) return 'fair';
      return 'poor';
      
    } catch (error) {
      logger.warn("⚠️ Failed to calculate connection quality:", error);
      return 'unknown';
    }
  }

  /**
   * Persist status to database
   */
  async persistStatusToDatabase(sessionId, statusData) {
    try {
      await SessionModel.update({
        status: statusData.status,
        lastStatusCheck: statusData.timestamp,
        connectionQuality: statusData.connectionQuality,
        metadata: statusData.metadata
      }, {
        where: { sessionId: statusData.whatsappSessionId }
      });

      // TODO: Also save to status_history table for audit trail
      // await StatusHistory.create({ ... });
      
    } catch (error) {
      logger.error(`❌ Failed to persist status to database for ${sessionId}:`, error);
    }
  }

  /**
   * Emit real-time status update via Socket.IO
   */
  async emitStatusUpdate(sessionId, statusData) {
    try {
      const io = this.io || getSocket();
      
      if (!io) {
        logger.warn("⚠️ Socket.IO not available for status update emission");
        return;
      }
      
      // Get user ID from session (you might need to adjust this based on your session structure)
      const session = await SessionModel.findOne({
        where: { sessionId: statusData.whatsappSessionId }
      });

      if (session && session.userId) {
        // Emit to specific user
        io.to(`user_${session.userId}`).emit('whatsapp-account-status', {
          sessionId: statusData.sessionId,
          whatsappSessionId: statusData.whatsappSessionId,
          status: statusData.status,
          connectionQuality: statusData.connectionQuality,
          lastSeen: statusData.lastSeen,
          timestamp: statusData.timestamp,
          metadata: statusData.metadata
        });

        logger.info(`📡 Status update emitted for session ${sessionId} to user ${session.userId}`);
      }

      // Also emit to global admin channel if needed
      io.emit('whatsapp-global-status', {
        sessionId: statusData.sessionId,
        status: statusData.status,
        timestamp: statusData.timestamp
      });

    } catch (error) {
      logger.error(`❌ Failed to emit status update for ${sessionId}:`, error);
    }
  }

  /**
   * Handle critical status changes (blocked, disconnected, etc.)
   */
  async handleCriticalStatusChange(sessionId, newStatus, previousStatus) {
    try {
      const criticalStatuses = ['blocked', 'restricted', 'banned', 'logged_out'];
      
      if (criticalStatuses.includes(newStatus)) {
        logger.warn(`🚨 Critical status change detected for session ${sessionId}: ${previousStatus} → ${newStatus}`);
        
        // Emit critical alert
        await this.emitCriticalAlert(sessionId, newStatus, previousStatus);
        
        // Auto-pause any running blasts
        await this.autoPauseBlasts(sessionId, newStatus);
        
        // Schedule reconnection attempt if appropriate
        if (newStatus === 'disconnected') {
          await this.scheduleReconnectionAttempt(sessionId);
        }
      }
      
      // Handle reconnection success
      if (newStatus === 'connected' && ['disconnected', 'blocked'].includes(previousStatus)) {
        logger.info(`✅ Session ${sessionId} recovered from ${previousStatus}`);
        await this.handleSessionRecovery(sessionId);
      }
      
    } catch (error) {
      logger.error(`❌ Failed to handle critical status change for ${sessionId}:`, error);
    }
  }

  /**
   * Emit critical alert notification
   */
  async emitCriticalAlert(sessionId, status, previousStatus) {
    try {
      const io = getSocket();
      const session = await SessionModel.findOne({
        where: { sessionId }
      });

      if (session && session.userId) {
        const alertData = {
          type: 'critical',
          sessionId,
          status,
          previousStatus,
          message: this.getCriticalStatusMessage(status),
          timestamp: new Date(),
          actions: this.getSuggestedActions(status)
        };

        io.to(`user_${session.userId}`).emit('whatsapp-critical-alert', alertData);
        
        // Also send toast notification
        io.to(`user_${session.userId}`).emit('toast-notification', {
          type: 'error',
          title: 'WhatsApp Account Issue',
          description: alertData.message
        });

        logger.warn(`🚨 Critical alert emitted for session ${sessionId}: ${status}`);
      }
    } catch (error) {
      logger.error(`❌ Failed to emit critical alert for ${sessionId}:`, error);
    }
  }

  /**
   * Get human-readable message for critical status
   */
  getCriticalStatusMessage(status) {
    const messages = {
      'blocked': 'WhatsApp account has been temporarily blocked',
      'restricted': 'Account has sending restrictions applied',
      'banned': 'Account has been permanently banned',
      'logged_out': 'Account was logged out from another device',
      'disconnected': 'Connection to WhatsApp servers lost'
    };
    
    return messages[status] || `Account status changed to: ${status}`;
  }

  /**
   * Get suggested actions for status
   */
  getSuggestedActions(status) {
    const actions = {
      'blocked': ['wait', 'contact_support'],
      'restricted': ['reduce_sending', 'wait'],
      'banned': ['contact_support', 'create_new_account'],
      'logged_out': ['reconnect', 'scan_qr'],
      'disconnected': ['reconnect', 'check_internet']
    };
    
    return actions[status] || ['reconnect'];
  }

  /**
   * Auto-pause running blasts for problematic session
   */
  async autoPauseBlasts(sessionId, reason) {
    try {
      // This would integrate with your blast system
      // For now, emit an event that blast controllers can listen to
      this.emit('auto-pause-blast', {
        sessionId,
        reason,
        timestamp: new Date()
      });

      logger.info(`⏸️ Auto-pause signal sent for session ${sessionId} due to: ${reason}`);
      
    } catch (error) {
      logger.error(`❌ Failed to auto-pause blasts for ${sessionId}:`, error);
    }
  }

  /**
   * Schedule reconnection attempt
   */
  async scheduleReconnectionAttempt(sessionId) {
    try {
      const attempts = this.reconnectionAttempts.get(sessionId) || 0;
      
      if (attempts < this.maxReconnectionAttempts) {
        const delay = Math.pow(2, attempts) * 30000; // Exponential backoff: 30s, 60s, 120s
        
        setTimeout(async () => {
          logger.info(`🔄 Attempting reconnection for session ${sessionId} (attempt ${attempts + 1})`);
          this.reconnectionAttempts.set(sessionId, attempts + 1);
          
          // Emit reconnection attempt
          this.emit('reconnection-attempt', {
            sessionId,
            attempt: attempts + 1,
            maxAttempts: this.maxReconnectionAttempts
          });
          
        }, delay);
        
      } else {
        logger.warn(`❌ Max reconnection attempts reached for session ${sessionId}`);
        await this.emitMaxReconnectionReached(sessionId);
      }
      
    } catch (error) {
      logger.error(`❌ Failed to schedule reconnection for ${sessionId}:`, error);
    }
  }

  /**
   * Handle session recovery
   */
  async handleSessionRecovery(sessionId) {
    try {
      // Reset reconnection attempts
      this.reconnectionAttempts.delete(sessionId);
      
      // Emit recovery notification
      const io = getSocket();
      const session = await SessionModel.findOne({
        where: { sessionId }
      });

      if (session && session.userId) {
        io.to(`user_${session.userId}`).emit('toast-notification', {
          type: 'success',
          title: 'WhatsApp Account Recovered',
          description: 'Connection restored successfully'
        });
        
        // Signal that blasts can be resumed
        this.emit('session-recovered', {
          sessionId,
          timestamp: new Date()
        });
      }

      logger.info(`✅ Session recovery handled for ${sessionId}`);
      
    } catch (error) {
      logger.error(`❌ Failed to handle session recovery for ${sessionId}:`, error);
    }
  }

  /**
   * Update session health score
   */
  async updateSessionHealthScore(sessionId, statusData) {
    try {
      let healthScore = 100;
      
      // Reduce score based on status
      switch (statusData.status) {
        case 'connected':
          healthScore = 100;
          break;
        case 'connecting':
          healthScore = 70;
          break;
        case 'disconnected':
          healthScore = 30;
          break;
        case 'blocked':
        case 'restricted':
        case 'banned':
          healthScore = 10;
          break;
        default:
          healthScore = 50;
      }
      
      // Adjust based on connection quality
      const qualityScores = {
        'excellent': 0,
        'good': -10,
        'fair': -20,
        'poor': -30,
        'unknown': -15
      };
      
      healthScore += qualityScores[statusData.connectionQuality] || 0;
      healthScore = Math.max(0, Math.min(100, healthScore));
      
      // Update in database
      await SessionModel.update({
        healthScore
      }, {
        where: { sessionId: statusData.whatsappSessionId }
      });
      
    } catch (error) {
      logger.error(`❌ Failed to update health score for ${sessionId}:`, error);
    }
  }

  /**
   * Start periodic health check timer
   */
  startHealthCheckTimer() {
    this.healthCheckTimer = setInterval(async () => {
      await this.performPeriodicHealthCheck();
    }, this.healthCheckInterval);
    
    logger.info(`⏰ Health check timer started (interval: ${this.healthCheckInterval}ms)`);
  }

  /**
   * Perform periodic health check on all active sessions
   */
  async performPeriodicHealthCheck() {
    try {
      const activeSessions = await SessionModel.findAll({
        where: {
          status: ['connected', 'connecting']
        }
      });

      for (const session of activeSessions) {
        // Ping session to check if still alive
        const lastCheck = new Date(session.lastStatusCheck);
        const timeSinceLastCheck = Date.now() - lastCheck.getTime();
        
        // If no update for more than 2 minutes, mark as potentially disconnected
        if (timeSinceLastCheck > 120000) {
          await this.trackSession(
            session.sessionId,
            session.sessionId,
            'disconnected',
            { reason: 'health_check_timeout' }
          );
        }
      }
      
    } catch (error) {
      logger.error("❌ Failed to perform periodic health check:", error);
    }
  }

  /**
   * Get current status for a session
   */
  getSessionStatus(sessionId) {
    return this.statusCache.get(sessionId);
  }

  /**
   * Get all tracked sessions
   */
  getAllTrackedSessions() {
    return Array.from(this.statusCache.values());
  }

  /**
   * Stop the monitor
   */
  stop() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    
    this.statusCache.clear();
    this.reconnectionAttempts.clear();
    
    logger.info("🛑 WhatsApp Status Monitor stopped");
  }
}

// Create singleton instance
const whatsAppStatusMonitor = new WhatsAppStatusMonitor();

module.exports = {
  WhatsAppStatusMonitor,
  whatsAppStatusMonitor
};