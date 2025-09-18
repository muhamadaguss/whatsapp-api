/**
 * AutoRecoveryService
 * 
 * Automated recovery system that provides:
 * - Smart reconnection strategies with exponential backoff
 * - Intelligent retry logic based on error type
 * - Session state preservation during reconnection
 * - Automatic blast resume after recovery
 * - Failover mechanisms for multiple accounts
 * - Performance optimization during recovery
 * 
 * @author WhatsApp Enhancement Team
 * @version 1.0.0
 * @created September 17, 2025
 */

const EventEmitter = require('events');

class AutoRecoveryService extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      // Reconnection strategy settings
      reconnection: {
        maxAttempts: options.maxAttempts || 10,
        baseDelay: options.baseDelay || 5000, // 5 seconds
        maxDelay: options.maxDelay || 300000, // 5 minutes
        exponentialFactor: options.exponentialFactor || 2,
        jitterMax: options.jitterMax || 1000 // Random delay up to 1 second
      },
      
      // Recovery strategy by error type
      errorStrategies: {
        'connection_lost': {
          retryAttempts: 5,
          cooldownPeriod: 30000, // 30 seconds
          strategy: 'immediate_retry'
        },
        'authentication_failed': {
          retryAttempts: 3,
          cooldownPeriod: 120000, // 2 minutes
          strategy: 'delayed_retry'
        },
        'rate_limited': {
          retryAttempts: 8,
          cooldownPeriod: 300000, // 5 minutes
          strategy: 'exponential_backoff'
        },
        'blocked_account': {
          retryAttempts: 0, // Don't retry blocked accounts
          cooldownPeriod: 3600000, // 1 hour before checking again
          strategy: 'no_retry'
        },
        'qr_timeout': {
          retryAttempts: 3,
          cooldownPeriod: 60000, // 1 minute
          strategy: 'qr_regeneration'
        }
      },
      
      // Session preservation settings
      preservation: {
        saveStateInterval: options.saveStateInterval || 30000, // 30 seconds
        maxStateHistory: options.maxStateHistory || 10,
        persistSession: options.persistSession !== false
      },
      
      // Health monitoring
      healthCheck: {
        interval: options.healthCheckInterval || 60000, // 1 minute
        timeout: options.healthCheckTimeout || 10000, // 10 seconds
        failureThreshold: options.failureThreshold || 3
      },
      
      // Blast management during recovery
      blastManagement: {
        pauseOnDisconnect: options.pauseOnDisconnect !== false,
        autoResumeAfterRecovery: options.autoResumeAfterRecovery !== false,
        preserveQueue: options.preserveQueue !== false,
        maxPauseDuration: options.maxPauseDuration || 1800000 // 30 minutes
      },
      
      ...options
    };
    
    // Recovery state tracking
    this.recoveryStates = new Map();
    this.healthChecks = new Map();
    this.sessionStates = new Map();
    this.pausedBlasts = new Map();
    
    // Service references (will be injected)
    this.whatsappStatusMonitor = null;
    this.blastControlService = null;
    this.smartAlertManager = null;
    
    console.log('🔄 AutoRecoveryService initialized with options:', {
      maxAttempts: this.options.reconnection.maxAttempts,
      baseDelay: this.options.reconnection.baseDelay,
      blastManagement: this.options.blastManagement
    });
    
    // Start health check monitoring
    this.startHealthMonitoring();
  }

  /**
   * Set service dependencies
   * @param {Object} services - Service instances
   */
  setServiceDependencies(services) {
    this.whatsappStatusMonitor = services.whatsappStatusMonitor;
    this.blastControlService = services.blastControlService;
    this.smartAlertManager = services.smartAlertManager;
    
    console.log('🔗 AutoRecoveryService dependencies injected');
  }

  /**
   * Start health monitoring for all sessions
   */
  startHealthMonitoring() {
    setInterval(() => {
      this.performHealthChecks();
    }, this.options.healthCheck.interval);
    
    console.log('❤️ Health monitoring started');
  }

  /**
   * Process session disconnect event and initiate recovery
   * @param {Object} disconnectEvent - Disconnect event data
   */
  async handleSessionDisconnect(disconnectEvent) {
    try {
      const {
        sessionId,
        reason,
        metadata = {},
        timestamp = new Date()
      } = disconnectEvent;

      console.log(`🔌 Session ${sessionId} disconnected. Reason: ${reason}`);

      // Determine error type and recovery strategy
      const errorType = this.classifyError(reason, metadata);
      const strategy = this.options.errorStrategies[errorType] || this.options.errorStrategies['connection_lost'];

      // Create or update recovery state
      const recoveryState = this.getOrCreateRecoveryState(sessionId);
      recoveryState.lastDisconnect = timestamp;
      recoveryState.errorType = errorType;
      recoveryState.reason = reason;
      recoveryState.metadata = metadata;

      // Pause active blasts if configured
      if (this.options.blastManagement.pauseOnDisconnect) {
        await this.pauseActiveBlasts(sessionId, reason);
      }

      // Save current session state
      await this.preserveSessionState(sessionId);

      // Start recovery process based on strategy
      if (strategy.retryAttempts > 0) {
        await this.initiateRecovery(sessionId, strategy);
      } else {
        console.log(`⏸️ No recovery strategy for ${errorType}, marking session for manual intervention`);
        await this.markSessionForManualIntervention(sessionId, errorType);
      }

    } catch (error) {
      console.error('❌ Error handling session disconnect:', error);
    }
  }

  /**
   * Classify error type based on reason and metadata
   * @param {string} reason - Disconnect reason
   * @param {Object} metadata - Additional error information
   * @returns {string} Error classification
   */
  classifyError(reason, metadata) {
    const reasonLower = reason.toLowerCase();
    
    // Check for specific error patterns
    if (reasonLower.includes('blocked') || reasonLower.includes('banned')) {
      return 'blocked_account';
    }
    
    if (reasonLower.includes('rate') || reasonLower.includes('limit')) {
      return 'rate_limited';
    }
    
    if (reasonLower.includes('auth') || reasonLower.includes('unauthorized')) {
      return 'authentication_failed';
    }
    
    if (reasonLower.includes('qr') || reasonLower.includes('timeout')) {
      return 'qr_timeout';
    }
    
    if (reasonLower.includes('network') || reasonLower.includes('connection')) {
      return 'connection_lost';
    }
    
    // Check metadata for additional clues
    if (metadata.statusCode === 401 || metadata.statusCode === 403) {
      return 'authentication_failed';
    }
    
    if (metadata.statusCode === 429) {
      return 'rate_limited';
    }
    
    // Default to connection lost
    return 'connection_lost';
  }

  /**
   * Get or create recovery state for session
   * @param {string} sessionId 
   * @returns {Object} Recovery state
   */
  getOrCreateRecoveryState(sessionId) {
    if (!this.recoveryStates.has(sessionId)) {
      this.recoveryStates.set(sessionId, {
        sessionId,
        attempts: 0,
        lastAttempt: null,
        lastSuccess: null,
        consecutiveFailures: 0,
        totalFailures: 0,
        isRecovering: false,
        strategy: null,
        createdAt: new Date()
      });
    }
    
    return this.recoveryStates.get(sessionId);
  }

  /**
   * Pause active blasts for session
   * @param {string} sessionId 
   * @param {string} reason 
   */
  async pauseActiveBlasts(sessionId, reason) {
    try {
      if (!this.blastControlService) {
        console.log('⚠️ BlastControlService not available, cannot pause blasts');
        return;
      }

      // Get active blasts for session
      const activeBlasts = await this.blastControlService.getActiveBlastsBySession(sessionId);
      
      for (const blast of activeBlasts) {
        // Save blast state before pausing
        const blastState = {
          blastId: blast.id,
          sessionId,
          pausedAt: new Date(),
          reason,
          lastMessageIndex: blast.currentMessageIndex || 0,
          remainingMessages: blast.remainingMessages || [],
          progress: blast.progress || {}
        };
        
        this.pausedBlasts.set(blast.id, blastState);
        
        // Pause the blast
        await this.blastControlService.pauseBlast(blast.id, `Auto-paused: ${reason}`);
        
        console.log(`⏸️ Paused blast ${blast.id} for session ${sessionId}`);
      }

      // Emit event for UI notification
      this.emit('blasts_paused', {
        sessionId,
        pausedBlasts: activeBlasts.map(b => b.id),
        reason
      });

    } catch (error) {
      console.error('❌ Error pausing active blasts:', error);
    }
  }

  /**
   * Preserve session state for recovery
   * @param {string} sessionId 
   */
  async preserveSessionState(sessionId) {
    try {
      if (!this.options.preservation.persistSession) return;

      // Get current session state from WhatsApp Status Monitor
      const currentState = this.whatsappStatusMonitor ? 
        await this.whatsappStatusMonitor.getSessionState(sessionId) : null;

      if (currentState) {
        const sessionHistory = this.sessionStates.get(sessionId) || [];
        
        // Add current state to history
        sessionHistory.push({
          timestamp: new Date(),
          state: currentState,
          preservedFor: 'recovery'
        });
        
        // Keep only recent states
        const maxHistory = this.options.preservation.maxStateHistory;
        if (sessionHistory.length > maxHistory) {
          sessionHistory.splice(0, sessionHistory.length - maxHistory);
        }
        
        this.sessionStates.set(sessionId, sessionHistory);
        
        console.log(`💾 Preserved session state for ${sessionId}`);
      }

    } catch (error) {
      console.error('❌ Error preserving session state:', error);
    }
  }

  /**
   * Initiate recovery process for session
   * @param {string} sessionId 
   * @param {Object} strategy 
   */
  async initiateRecovery(sessionId, strategy) {
    const recoveryState = this.getOrCreateRecoveryState(sessionId);
    
    if (recoveryState.isRecovering) {
      console.log(`🔄 Recovery already in progress for session ${sessionId}`);
      return;
    }

    recoveryState.isRecovering = true;
    recoveryState.strategy = strategy;
    
    console.log(`🚀 Initiating recovery for session ${sessionId} with strategy: ${strategy.strategy}`);

    try {
      switch (strategy.strategy) {
        case 'immediate_retry':
          await this.immediateRetryStrategy(sessionId, strategy);
          break;
          
        case 'delayed_retry':
          await this.delayedRetryStrategy(sessionId, strategy);
          break;
          
        case 'exponential_backoff':
          await this.exponentialBackoffStrategy(sessionId, strategy);
          break;
          
        case 'qr_regeneration':
          await this.qrRegenerationStrategy(sessionId, strategy);
          break;
          
        default:
          console.log(`❓ Unknown recovery strategy: ${strategy.strategy}`);
          break;
      }
    } catch (error) {
      console.error(`❌ Error in recovery strategy for session ${sessionId}:`, error);
      recoveryState.isRecovering = false;
    }
  }

  /**
   * Immediate retry strategy
   * @param {string} sessionId 
   * @param {Object} strategy 
   */
  async immediateRetryStrategy(sessionId, strategy) {
    const recoveryState = this.recoveryStates.get(sessionId);
    
    for (let attempt = 1; attempt <= strategy.retryAttempts; attempt++) {
      if (attempt > 1) {
        // Small delay between immediate retries
        await this.delay(2000 * attempt);
      }
      
      console.log(`🔄 Immediate retry attempt ${attempt}/${strategy.retryAttempts} for session ${sessionId}`);
      
      const success = await this.attemptReconnection(sessionId, attempt);
      
      if (success) {
        await this.handleRecoverySuccess(sessionId);
        return;
      }
      
      recoveryState.attempts = attempt;
      recoveryState.lastAttempt = new Date();
    }
    
    await this.handleRecoveryFailure(sessionId, 'immediate_retry_exhausted');
  }

  /**
   * Delayed retry strategy
   * @param {string} sessionId 
   * @param {Object} strategy 
   */
  async delayedRetryStrategy(sessionId, strategy) {
    const recoveryState = this.recoveryStates.get(sessionId);
    
    console.log(`⏰ Starting delayed retry for session ${sessionId}, waiting ${strategy.cooldownPeriod}ms`);
    
    // Wait for cooldown period
    await this.delay(strategy.cooldownPeriod);
    
    for (let attempt = 1; attempt <= strategy.retryAttempts; attempt++) {
      console.log(`🔄 Delayed retry attempt ${attempt}/${strategy.retryAttempts} for session ${sessionId}`);
      
      const success = await this.attemptReconnection(sessionId, attempt);
      
      if (success) {
        await this.handleRecoverySuccess(sessionId);
        return;
      }
      
      recoveryState.attempts = attempt;
      recoveryState.lastAttempt = new Date();
      
      // Wait between attempts (increasing delay)
      if (attempt < strategy.retryAttempts) {
        await this.delay(30000 * attempt); // 30s, 60s, 90s...
      }
    }
    
    await this.handleRecoveryFailure(sessionId, 'delayed_retry_exhausted');
  }

  /**
   * Exponential backoff strategy
   * @param {string} sessionId 
   * @param {Object} strategy 
   */
  async exponentialBackoffStrategy(sessionId, strategy) {
    const recoveryState = this.recoveryStates.get(sessionId);
    const reconnectionOptions = this.options.reconnection;
    
    for (let attempt = 1; attempt <= strategy.retryAttempts; attempt++) {
      // Calculate delay with exponential backoff
      const baseDelay = reconnectionOptions.baseDelay;
      const exponentialDelay = baseDelay * Math.pow(reconnectionOptions.exponentialFactor, attempt - 1);
      const maxDelay = reconnectionOptions.maxDelay;
      const jitter = Math.random() * reconnectionOptions.jitterMax;
      
      const delay = Math.min(exponentialDelay, maxDelay) + jitter;
      
      if (attempt > 1) {
        console.log(`⏰ Exponential backoff: waiting ${Math.round(delay/1000)}s before attempt ${attempt}`);
        await this.delay(delay);
      }
      
      console.log(`🔄 Exponential backoff attempt ${attempt}/${strategy.retryAttempts} for session ${sessionId}`);
      
      const success = await this.attemptReconnection(sessionId, attempt);
      
      if (success) {
        await this.handleRecoverySuccess(sessionId);
        return;
      }
      
      recoveryState.attempts = attempt;
      recoveryState.lastAttempt = new Date();
    }
    
    await this.handleRecoveryFailure(sessionId, 'exponential_backoff_exhausted');
  }

  /**
   * QR regeneration strategy
   * @param {string} sessionId 
   * @param {Object} strategy 
   */
  async qrRegenerationStrategy(sessionId, strategy) {
    const recoveryState = this.recoveryStates.get(sessionId);
    
    for (let attempt = 1; attempt <= strategy.retryAttempts; attempt++) {
      console.log(`📱 QR regeneration attempt ${attempt}/${strategy.retryAttempts} for session ${sessionId}`);
      
      try {
        // Generate new QR code
        const qrResult = await this.generateNewQR(sessionId);
        
        if (qrResult.success) {
          // Emit QR code for manual scanning
          this.emit('qr_generated', {
            sessionId,
            qrCode: qrResult.qrCode,
            attempt,
            expiresAt: qrResult.expiresAt
          });
          
          // Wait for QR scan or timeout
          const scanSuccess = await this.waitForQRScan(sessionId, qrResult.timeout || 60000);
          
          if (scanSuccess) {
            await this.handleRecoverySuccess(sessionId);
            return;
          }
        }
        
      } catch (error) {
        console.error(`❌ Error in QR regeneration attempt ${attempt}:`, error);
      }
      
      recoveryState.attempts = attempt;
      recoveryState.lastAttempt = new Date();
      
      // Wait before next attempt
      if (attempt < strategy.retryAttempts) {
        await this.delay(strategy.cooldownPeriod);
      }
    }
    
    await this.handleRecoveryFailure(sessionId, 'qr_regeneration_exhausted');
  }

  /**
   * Attempt reconnection for session
   * @param {string} sessionId 
   * @param {number} attempt 
   * @returns {boolean} Success status
   */
  async attemptReconnection(sessionId, attempt) {
    try {
      if (!this.whatsappStatusMonitor) {
        console.log('⚠️ WhatsAppStatusMonitor not available');
        return false;
      }

      // Restore session state if available
      await this.restoreSessionState(sessionId);

      // Attempt reconnection through status monitor
      const reconnectResult = await this.whatsappStatusMonitor.reconnectSession(sessionId);
      
      if (reconnectResult.success) {
        console.log(`✅ Reconnection attempt ${attempt} successful for session ${sessionId}`);
        return true;
      } else {
        console.log(`❌ Reconnection attempt ${attempt} failed for session ${sessionId}: ${reconnectResult.error}`);
        return false;
      }

    } catch (error) {
      console.error(`❌ Error in reconnection attempt ${attempt}:`, error);
      return false;
    }
  }

  /**
   * Restore session state from preserved data
   * @param {string} sessionId 
   */
  async restoreSessionState(sessionId) {
    try {
      const sessionHistory = this.sessionStates.get(sessionId);
      
      if (sessionHistory && sessionHistory.length > 0) {
        const latestState = sessionHistory[sessionHistory.length - 1];
        
        if (this.whatsappStatusMonitor) {
          await this.whatsappStatusMonitor.restoreSessionState(sessionId, latestState.state);
          console.log(`🔄 Restored session state for ${sessionId}`);
        }
      }

    } catch (error) {
      console.error('❌ Error restoring session state:', error);
    }
  }

  /**
   * Generate new QR code for session
   * @param {string} sessionId 
   * @returns {Object} QR generation result
   */
  async generateNewQR(sessionId) {
    try {
      if (!this.whatsappStatusMonitor) {
        throw new Error('WhatsAppStatusMonitor not available');
      }

      const qrResult = await this.whatsappStatusMonitor.generateQR(sessionId);
      
      return {
        success: true,
        qrCode: qrResult.qr,
        timeout: qrResult.timeout || 60000,
        expiresAt: new Date(Date.now() + (qrResult.timeout || 60000))
      };

    } catch (error) {
      console.error('❌ Error generating QR code:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Wait for QR code scan
   * @param {string} sessionId 
   * @param {number} timeout 
   * @returns {boolean} Scan success
   */
  async waitForQRScan(sessionId, timeout) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        cleanup();
        resolve(false);
      }, timeout);
      
      const onConnected = (data) => {
        if (data.sessionId === sessionId && data.status === 'connected') {
          cleanup();
          resolve(true);
        }
      };
      
      const cleanup = () => {
        clearTimeout(timer);
        if (this.whatsappStatusMonitor) {
          this.whatsappStatusMonitor.off('session_connected', onConnected);
        }
      };
      
      if (this.whatsappStatusMonitor) {
        this.whatsappStatusMonitor.on('session_connected', onConnected);
      }
    });
  }

  /**
   * Handle successful recovery
   * @param {string} sessionId 
   */
  async handleRecoverySuccess(sessionId) {
    const recoveryState = this.recoveryStates.get(sessionId);
    
    if (recoveryState) {
      recoveryState.isRecovering = false;
      recoveryState.lastSuccess = new Date();
      recoveryState.consecutiveFailures = 0;
    }

    console.log(`✅ Recovery successful for session ${sessionId}`);

    // Resume paused blasts if configured
    if (this.options.blastManagement.autoResumeAfterRecovery) {
      await this.resumePausedBlasts(sessionId);
    }

    // Notify smart alert manager
    if (this.smartAlertManager) {
      this.smartAlertManager.emit('recovery_success', {
        sessionId,
        recoveredAt: new Date(),
        attempts: recoveryState ? recoveryState.attempts : 0
      });
    }

    // Emit recovery success event
    this.emit('recovery_success', {
      sessionId,
      recoveryState: recoveryState
    });
  }

  /**
   * Handle recovery failure
   * @param {string} sessionId 
   * @param {string} reason 
   */
  async handleRecoveryFailure(sessionId, reason) {
    const recoveryState = this.recoveryStates.get(sessionId);
    
    if (recoveryState) {
      recoveryState.isRecovering = false;
      recoveryState.consecutiveFailures += 1;
      recoveryState.totalFailures += 1;
    }

    console.log(`❌ Recovery failed for session ${sessionId}. Reason: ${reason}`);

    // Mark session for manual intervention
    await this.markSessionForManualIntervention(sessionId, reason);

    // Notify smart alert manager
    if (this.smartAlertManager) {
      this.smartAlertManager.emit('recovery_failure', {
        sessionId,
        reason,
        failedAt: new Date(),
        attempts: recoveryState ? recoveryState.attempts : 0
      });
    }

    // Emit recovery failure event
    this.emit('recovery_failure', {
      sessionId,
      reason,
      recoveryState: recoveryState
    });
  }

  /**
   * Resume paused blasts for session
   * @param {string} sessionId 
   */
  async resumePausedBlasts(sessionId) {
    try {
      const pausedBlastEntries = Array.from(this.pausedBlasts.entries())
        .filter(([blastId, state]) => state.sessionId === sessionId);

      for (const [blastId, blastState] of pausedBlastEntries) {
        // Check if blast hasn't exceeded max pause duration
        const pauseDuration = new Date() - blastState.pausedAt;
        
        if (pauseDuration > this.options.blastManagement.maxPauseDuration) {
          console.log(`⏰ Blast ${blastId} exceeded max pause duration, not resuming`);
          this.pausedBlasts.delete(blastId);
          continue;
        }

        // Resume blast with preserved state
        if (this.blastControlService) {
          await this.blastControlService.resumeBlast(blastId, {
            resumeFromIndex: blastState.lastMessageIndex,
            preservedProgress: blastState.progress
          });
          
          console.log(`▶️ Resumed blast ${blastId} for session ${sessionId}`);
        }
        
        // Remove from paused blasts
        this.pausedBlasts.delete(blastId);
      }

      // Emit event for UI notification
      this.emit('blasts_resumed', {
        sessionId,
        resumedBlasts: pausedBlastEntries.map(([blastId]) => blastId)
      });

    } catch (error) {
      console.error('❌ Error resuming paused blasts:', error);
    }
  }

  /**
   * Mark session for manual intervention
   * @param {string} sessionId 
   * @param {string} reason 
   */
  async markSessionForManualIntervention(sessionId, reason) {
    const recoveryState = this.recoveryStates.get(sessionId);
    
    if (recoveryState) {
      recoveryState.needsManualIntervention = true;
      recoveryState.interventionReason = reason;
      recoveryState.markedAt = new Date();
    }

    console.log(`🚨 Session ${sessionId} marked for manual intervention: ${reason}`);

    // Create alert through smart alert manager
    if (this.smartAlertManager) {
      await this.smartAlertManager.createAlert({
        sessionId,
        level: 'critical',
        status: 'needs_intervention',
        healthScore: 0,
        connectionQuality: 'critical',
        metadata: {
          reason,
          recoveryAttempts: recoveryState ? recoveryState.attempts : 0,
          autoRecovery: false
        },
        timestamp: new Date(),
        type: 'manual_intervention'
      });
    }
  }

  /**
   * Perform health checks on all sessions
   */
  async performHealthChecks() {
    try {
      if (!this.whatsappStatusMonitor) return;

      const sessions = await this.whatsappStatusMonitor.getAllSessions();
      
      for (const session of sessions) {
        await this.performSessionHealthCheck(session.id);
      }

    } catch (error) {
      console.error('❌ Error performing health checks:', error);
    }
  }

  /**
   * Perform health check on specific session
   * @param {string} sessionId 
   */
  async performSessionHealthCheck(sessionId) {
    try {
      const healthCheck = this.healthChecks.get(sessionId) || {
        consecutiveFailures: 0,
        lastCheck: null,
        lastSuccess: null
      };

      const checkStart = Date.now();
      const isHealthy = await this.checkSessionHealth(sessionId);
      const checkDuration = Date.now() - checkStart;

      healthCheck.lastCheck = new Date();
      
      if (isHealthy) {
        healthCheck.consecutiveFailures = 0;
        healthCheck.lastSuccess = new Date();
      } else {
        healthCheck.consecutiveFailures += 1;
        
        // Trigger recovery if failure threshold exceeded
        if (healthCheck.consecutiveFailures >= this.options.healthCheck.failureThreshold) {
          console.log(`🏥 Health check failure threshold exceeded for session ${sessionId}`);
          
          await this.handleSessionDisconnect({
            sessionId,
            reason: 'health_check_failure',
            metadata: {
              consecutiveFailures: healthCheck.consecutiveFailures,
              checkDuration
            }
          });
        }
      }

      this.healthChecks.set(sessionId, healthCheck);

    } catch (error) {
      console.error(`❌ Error in health check for session ${sessionId}:`, error);
    }
  }

  /**
   * Check if session is healthy
   * @param {string} sessionId 
   * @returns {boolean} Health status
   */
  async checkSessionHealth(sessionId) {
    try {
      if (!this.whatsappStatusMonitor) return false;

      const status = await this.whatsappStatusMonitor.getSessionStatus(sessionId);
      
      return status && 
             status.status === 'connected' && 
             status.healthScore > 50 &&
             (new Date() - new Date(status.lastSeen)) < (5 * 60 * 1000); // Last seen within 5 minutes

    } catch (error) {
      console.error(`❌ Error checking session health for ${sessionId}:`, error);
      return false;
    }
  }

  /**
   * Get recovery statistics
   * @returns {Object} Recovery statistics
   */
  getRecoveryStatistics() {
    const states = Array.from(this.recoveryStates.values());
    const now = new Date();
    
    return {
      totalSessions: states.length,
      currentlyRecovering: states.filter(s => s.isRecovering).length,
      needingIntervention: states.filter(s => s.needsManualIntervention).length,
      successfulRecoveries: states.filter(s => s.lastSuccess).length,
      averageRecoveryTime: this.calculateAverageRecoveryTime(states),
      recoverySuccessRate: this.calculateSuccessRate(states),
      pausedBlasts: this.pausedBlasts.size,
      healthChecks: {
        totalSessions: this.healthChecks.size,
        recentFailures: Array.from(this.healthChecks.values())
          .filter(hc => hc.consecutiveFailures > 0).length
      }
    };
  }

  /**
   * Calculate average recovery time
   * @param {Array} states 
   * @returns {number} Average time in milliseconds
   */
  calculateAverageRecoveryTime(states) {
    const recoveredStates = states.filter(s => s.lastSuccess && s.lastAttempt);
    
    if (recoveredStates.length === 0) return 0;
    
    const totalTime = recoveredStates.reduce((sum, state) => {
      return sum + (state.lastSuccess - state.lastAttempt);
    }, 0);
    
    return Math.round(totalTime / recoveredStates.length);
  }

  /**
   * Calculate recovery success rate
   * @param {Array} states 
   * @returns {number} Success rate as percentage
   */
  calculateSuccessRate(states) {
    const totalAttempts = states.reduce((sum, state) => sum + state.attempts, 0);
    const successfulRecoveries = states.filter(s => s.lastSuccess).length;
    
    return totalAttempts > 0 ? Math.round((successfulRecoveries / states.length) * 100) : 0;
  }

  /**
   * Clean up old recovery data
   */
  cleanup() {
    const cutoffTime = new Date(Date.now() - (24 * 60 * 60 * 1000)); // 24 hours ago
    
    // Clean up old recovery states
    for (const [sessionId, state] of this.recoveryStates) {
      if (state.createdAt < cutoffTime && !state.isRecovering && !state.needsManualIntervention) {
        this.recoveryStates.delete(sessionId);
      }
    }
    
    // Clean up old session states
    for (const [sessionId, history] of this.sessionStates) {
      const filtered = history.filter(h => h.timestamp > cutoffTime);
      if (filtered.length === 0) {
        this.sessionStates.delete(sessionId);
      } else {
        this.sessionStates.set(sessionId, filtered);
      }
    }
    
    // Clean up old paused blasts
    for (const [blastId, state] of this.pausedBlasts) {
      if (state.pausedAt < cutoffTime) {
        this.pausedBlasts.delete(blastId);
      }
    }
    
    console.log('🧹 AutoRecoveryService cleanup completed');
  }

  /**
   * Utility function for delays
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise} Promise that resolves after delay
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = AutoRecoveryService;