const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/authMiddleware");
const { asyncHandler, AppError } = require("../middleware/errorHandler");
const { whatsAppStatusMonitor } = require("../services/whatsAppStatusMonitor");
const SessionModel = require("../models/sessionModel");
const { getSock, startWhatsApp } = require("../auth/session");
const logger = require("../utils/logger");

/**
 * WhatsApp Status Management Routes
 */

// Apply auth middleware to all routes
router.use(verifyToken);

/**
 * Get current status for a specific session
 * GET /whatsapp/sessions/:sessionId/status
 */
router.get("/sessions/:sessionId/status", asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  
  try {
    // Get real-time status from monitor
    const realtimeStatus = whatsAppStatusMonitor.getSessionStatus(sessionId);
    
    // Get session details from database
    const session = await SessionModel.findOne({
      where: { sessionId },
      attributes: [
        'sessionId', 'phoneNumber', 'displayName', 'status', 
        'lastStatusCheck', 'connectionQuality', 'healthScore', 'metadata'
      ]
    });

    if (!session) {
      throw new AppError("Session not found", 404);
    }

    // Combine database and real-time data
    const statusData = {
      sessionId,
      phoneNumber: session.phoneNumber,
      displayName: session.displayName,
      status: realtimeStatus?.status || session.status,
      connectionQuality: realtimeStatus?.connectionQuality || session.connectionQuality,
      healthScore: session.healthScore || 0,
      lastSeen: realtimeStatus?.lastSeen || session.lastStatusCheck,
      metadata: {
        ...session.metadata,
        ...realtimeStatus?.metadata
      },
      realTimeData: !!realtimeStatus,
      timestamp: new Date()
    };

    res.json({
      success: true,
      data: statusData
    });

  } catch (error) {
    logger.error(`Failed to get status for session ${sessionId}:`, error);
    throw new AppError(`Failed to get session status: ${error.message}`, 500);
  }
}));

/**
 * Perform manual health check for a session
 * POST /whatsapp/sessions/:sessionId/health-check
 */
router.post("/sessions/:sessionId/health-check", asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  
  try {
    const sock = getSock(sessionId);
    
    if (!sock) {
      throw new AppError("Session not found or not active", 404);
    }

    // Perform comprehensive health check
    const healthCheckStart = Date.now();
    
    // Test connection by getting chat list
    let connectionTest = false;
    let responseTime = 0;
    
    try {
      await sock.chatModify({ archive: false }, "test@test.com", { lastMessages: [] });
      connectionTest = true;
      responseTime = Date.now() - healthCheckStart;
    } catch (testError) {
      // This is expected to fail, we're just testing response time
      responseTime = Date.now() - healthCheckStart;
      connectionTest = responseTime < 5000; // Consider connected if responds within 5 seconds
    }

    // Check if user info is available
    const hasUserInfo = !!(sock.user?.id);
    
    // Determine overall health
    let status = 'connected';
    let healthScore = 100;
    
    if (!hasUserInfo) {
      status = 'disconnected';
      healthScore = 0;
    } else if (!connectionTest) {
      status = 'poor_connection';
      healthScore = 30;
    } else if (responseTime > 3000) {
      status = 'slow_connection';
      healthScore = 60;
    }

    const healthData = {
      sessionId,
      status,
      healthScore,
      responseTime,
      hasUserInfo,
      connectionTest,
      timestamp: new Date(),
      userInfo: hasUserInfo ? {
        phoneNumber: sock.user.id.split(':')[0],
        name: sock.user.name,
        platform: sock.user.platform
      } : null
    };

    // Track the health check result
    await whatsAppStatusMonitor.trackSession(
      sessionId,
      sessionId,
      status,
      {
        healthCheck: true,
        responseTime,
        hasUserInfo,
        connectionTest
      }
    );

    res.json({
      success: true,
      message: "Health check completed",
      data: healthData
    });

  } catch (error) {
    logger.error(`Health check failed for session ${sessionId}:`, error);
    
    // Track the failed health check
    await whatsAppStatusMonitor.trackSession(
      sessionId,
      sessionId,
      'health_check_failed',
      {
        error: error.message,
        timestamp: new Date()
      }
    );

    throw new AppError(`Health check failed: ${error.message}`, 500);
  }
}));

/**
 * Get status history for a session
 * GET /whatsapp/sessions/:sessionId/status-history
 */
router.get("/sessions/:sessionId/status-history", asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const { limit = 50, offset = 0 } = req.query;
  
  try {
    // For now, get from current session data
    // In future, implement proper status_history table
    const session = await SessionModel.findOne({
      where: { sessionId },
      attributes: ['metadata']
    });

    if (!session) {
      throw new AppError("Session not found", 404);
    }

    // Extract status history from metadata (if stored)
    const statusHistory = session.metadata?.statusHistory || [];
    
    // Add current real-time status
    const currentStatus = whatsAppStatusMonitor.getSessionStatus(sessionId);
    if (currentStatus) {
      statusHistory.unshift({
        status: currentStatus.status,
        timestamp: currentStatus.timestamp,
        connectionQuality: currentStatus.connectionQuality,
        metadata: currentStatus.metadata
      });
    }

    // Apply pagination
    const paginatedHistory = statusHistory.slice(offset, offset + parseInt(limit));

    res.json({
      success: true,
      data: {
        history: paginatedHistory,
        pagination: {
          total: statusHistory.length,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: statusHistory.length > (offset + parseInt(limit))
        }
      }
    });

  } catch (error) {
    logger.error(`Failed to get status history for session ${sessionId}:`, error);
    throw new AppError(`Failed to get status history: ${error.message}`, 500);
  }
}));

/**
 * Force reconnect a session
 * POST /whatsapp/sessions/:sessionId/reconnect
 */
router.post("/sessions/:sessionId/reconnect", asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const { force = false } = req.body;
  
  try {
    // Get current session info
    const session = await SessionModel.findOne({
      where: { sessionId }
    });

    if (!session) {
      throw new AppError("Session not found", 404);
    }

    // Check if already connected (unless force = true)
    const currentStatus = whatsAppStatusMonitor.getSessionStatus(sessionId);
    if (!force && currentStatus?.status === 'connected') {
      return res.json({
        success: true,
        message: "Session is already connected",
        data: {
          sessionId,
          status: 'connected',
          action: 'none'
        }
      });
    }

    // Track reconnection attempt
    await whatsAppStatusMonitor.trackSession(
      sessionId,
      sessionId,
      'reconnection_initiated',
      {
        force,
        initiatedBy: 'manual',
        userId: req.user.id,
        timestamp: new Date()
      }
    );

    // Attempt reconnection
    logger.info(`🔄 Manual reconnection initiated for session ${sessionId}`);
    
    try {
      await startWhatsApp(sessionId, session.userId);
      
      res.json({
        success: true,
        message: "Reconnection initiated successfully",
        data: {
          sessionId,
          action: 'reconnecting',
          timestamp: new Date()
        }
      });

    } catch (reconnectError) {
      // Track failed reconnection
      await whatsAppStatusMonitor.trackSession(
        sessionId,
        sessionId,
        'reconnection_failed',
        {
          error: reconnectError.message,
          timestamp: new Date()
        }
      );

      throw new AppError(`Reconnection failed: ${reconnectError.message}`, 500);
    }

  } catch (error) {
    logger.error(`Reconnection failed for session ${sessionId}:`, error);
    throw new AppError(`Failed to reconnect session: ${error.message}`, 500);
  }
}));

/**
 * Get all tracked sessions status overview
 * GET /whatsapp/sessions/status-overview
 */
router.get("/sessions/status-overview", asyncHandler(async (req, res) => {
  try {
    // Get all tracked sessions from monitor
    const trackedSessions = whatsAppStatusMonitor.getAllTrackedSessions();
    
    // Get session details from database
    const sessions = await SessionModel.findAll({
      where: {
        userId: req.user.id
      },
      attributes: [
        'sessionId', 'phoneNumber', 'displayName', 'status', 
        'healthScore', 'lastStatusCheck', 'createdAt'
      ]
    });

    // Combine data
    const statusOverview = sessions.map(session => {
      const realtimeData = trackedSessions.find(
        tracked => tracked.whatsappSessionId === session.sessionId
      );

      return {
        sessionId: session.sessionId,
        phoneNumber: session.phoneNumber,
        displayName: session.displayName,
        status: realtimeData?.status || session.status,
        healthScore: session.healthScore || 0,
        connectionQuality: realtimeData?.connectionQuality || 'unknown',
        lastSeen: realtimeData?.lastSeen || session.lastStatusCheck,
        isRealTime: !!realtimeData,
        createdAt: session.createdAt
      };
    });

    // Calculate summary statistics
    const summary = {
      total: statusOverview.length,
      connected: statusOverview.filter(s => s.status === 'connected').length,
      disconnected: statusOverview.filter(s => s.status === 'disconnected').length,
      blocked: statusOverview.filter(s => ['blocked', 'restricted', 'banned'].includes(s.status)).length,
      unknown: statusOverview.filter(s => s.status === 'unknown').length,
      averageHealthScore: statusOverview.length > 0 
        ? statusOverview.reduce((sum, s) => sum + s.healthScore, 0) / statusOverview.length 
        : 0
    };

    res.json({
      success: true,
      data: {
        sessions: statusOverview,
        summary,
        timestamp: new Date()
      }
    });

  } catch (error) {
    logger.error("Failed to get status overview:", error);
    throw new AppError(`Failed to get status overview: ${error.message}`, 500);
  }
}));

/**
 * Update session status manually (admin function)
 * PUT /whatsapp/sessions/:sessionId/status
 */
router.put("/sessions/:sessionId/status", asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const { status, reason } = req.body;
  
  if (!status) {
    throw new AppError("Status is required", 400);
  }

  const validStatuses = [
    'connected', 'disconnected', 'connecting', 'blocked', 
    'restricted', 'banned', 'logged_out', 'unknown'
  ];

  if (!validStatuses.includes(status)) {
    throw new AppError(`Invalid status. Valid options: ${validStatuses.join(', ')}`, 400);
  }

  try {
    // Track manual status update
    await whatsAppStatusMonitor.trackSession(
      sessionId,
      sessionId,
      status,
      {
        manualUpdate: true,
        reason,
        updatedBy: req.user.id,
        timestamp: new Date()
      }
    );

    res.json({
      success: true,
      message: "Status updated successfully",
      data: {
        sessionId,
        status,
        reason,
        updatedBy: req.user.id,
        timestamp: new Date()
      }
    });

  } catch (error) {
    logger.error(`Failed to update status for session ${sessionId}:`, error);
    throw new AppError(`Failed to update status: ${error.message}`, 500);
  }
}));

module.exports = router;