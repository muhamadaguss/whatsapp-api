/**
 * WebhookManager Service
 * 
 * Comprehensive webhook integration system that provides:
 * - External system notifications and integrations
 * - Third-party service webhook management
 * - Custom event triggers and filtering
 * - Webhook reliability with retry mechanisms
 * - Security with signature verification
 * - Rate limiting and queue management
 * 
 * @author WhatsApp Enhancement Team
 * @version 1.0.0
 * @created September 17, 2025
 */

const EventEmitter = require('events');
const axios = require('axios');
const crypto = require('crypto');

class WebhookManager extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      // Retry configuration
      retry: {
        maxAttempts: options.maxRetryAttempts || 5,
        baseDelay: options.baseRetryDelay || 1000, // 1 second
        maxDelay: options.maxRetryDelay || 60000, // 1 minute
        exponentialFactor: options.exponentialFactor || 2,
      },
      
      // Timeout settings
      timeout: {
        request: options.requestTimeout || 30000, // 30 seconds
        connection: options.connectionTimeout || 10000, // 10 seconds
      },
      
      // Security settings
      security: {
        enableSignature: options.enableSignature !== false,
        secretKey: options.secretKey || process.env.WEBHOOK_SECRET_KEY,
        algorithm: options.signatureAlgorithm || 'sha256',
        headerName: options.signatureHeader || 'X-Webhook-Signature',
      },
      
      // Rate limiting
      rateLimit: {
        enabled: options.enableRateLimit !== false,
        requestsPerMinute: options.requestsPerMinute || 60,
        burstLimit: options.burstLimit || 10,
      },
      
      // Queue management
      queue: {
        maxSize: options.maxQueueSize || 1000,
        processingInterval: options.processingInterval || 1000, // 1 second
        batchSize: options.batchSize || 5,
      },
      
      // Event filtering
      filters: {
        allowedEvents: options.allowedEvents || [],
        blockedEvents: options.blockedEvents || [],
        minimumSeverity: options.minimumSeverity || 'info',
      },
      
      ...options
    };
    
    // Webhook registrations storage
    this.registrations = new Map();
    this.eventQueue = [];
    this.rateLimitCounters = new Map();
    this.processingQueue = false;
    
    // Statistics tracking
    this.stats = {
      totalEvents: 0,
      successfulDeliveries: 0,
      failedDeliveries: 0,
      retries: 0,
      queuedEvents: 0,
      lastProcessedAt: null,
    };
    
    console.log('🔗 WebhookManager initialized with options:', {
      retry: this.options.retry.maxAttempts,
      timeout: this.options.timeout.request,
      security: this.options.security.enableSignature,
      rateLimit: this.options.rateLimit.enabled,
    });
    
    // Start queue processing
    this.startQueueProcessing();
    
    // Start rate limit cleanup
    this.startRateLimitCleanup();
  }

  /**
   * Register a new webhook endpoint
   * @param {Object} webhookConfig - Webhook configuration
   * @returns {string} Registration ID
   */
  registerWebhook(webhookConfig) {
    const {
      id = this.generateWebhookId(),
      url,
      events = ['*'], // Listen to all events by default
      headers = {},
      secret = null,
      enabled = true,
      description = '',
      filters = {},
      retryConfig = null,
    } = webhookConfig;

    // Validate URL
    if (!this.isValidUrl(url)) {
      throw new Error(`Invalid webhook URL: ${url}`);
    }

    const registration = {
      id,
      url,
      events: Array.isArray(events) ? events : [events],
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'WhatsApp-Webhook-Manager/1.0',
        ...headers,
      },
      secret: secret || this.options.security.secretKey,
      enabled,
      description,
      filters: {
        severity: filters.severity || [],
        sessionIds: filters.sessionIds || [],
        ...filters,
      },
      retryConfig: retryConfig || this.options.retry,
      createdAt: new Date(),
      lastTriggered: null,
      totalDeliveries: 0,
      successfulDeliveries: 0,
      failedDeliveries: 0,
    };

    this.registrations.set(id, registration);
    
    console.log(`📝 Registered webhook: ${id} for events: ${events.join(', ')}`);
    
    this.emit('webhook_registered', { webhookId: id, registration });
    
    return id;
  }

  /**
   * Unregister webhook endpoint
   * @param {string} webhookId - Webhook ID to unregister
   * @returns {boolean} Success status
   */
  unregisterWebhook(webhookId) {
    const registration = this.registrations.get(webhookId);
    
    if (!registration) {
      console.log(`⚠️ Webhook ${webhookId} not found for unregistration`);
      return false;
    }

    this.registrations.delete(webhookId);
    
    console.log(`🗑️ Unregistered webhook: ${webhookId}`);
    
    this.emit('webhook_unregistered', { webhookId, registration });
    
    return true;
  }

  /**
   * Update webhook configuration
   * @param {string} webhookId - Webhook ID to update
   * @param {Object} updates - Updated configuration
   * @returns {boolean} Success status
   */
  updateWebhook(webhookId, updates) {
    const registration = this.registrations.get(webhookId);
    
    if (!registration) {
      console.log(`⚠️ Webhook ${webhookId} not found for update`);
      return false;
    }

    // Validate URL if being updated
    if (updates.url && !this.isValidUrl(updates.url)) {
      throw new Error(`Invalid webhook URL: ${updates.url}`);
    }

    // Apply updates
    Object.assign(registration, {
      ...updates,
      updatedAt: new Date(),
    });

    console.log(`📝 Updated webhook: ${webhookId}`);
    
    this.emit('webhook_updated', { webhookId, registration, updates });
    
    return true;
  }

  /**
   * Trigger webhook for specific event
   * @param {string} eventType - Type of event
   * @param {Object} eventData - Event data payload
   * @param {Object} metadata - Additional metadata
   */
  async triggerWebhook(eventType, eventData, metadata = {}) {
    try {
      // Check if event should be filtered
      if (!this.shouldProcessEvent(eventType, eventData)) {
        return;
      }

      const eventPayload = {
        event: eventType,
        timestamp: new Date().toISOString(),
        data: eventData,
        metadata: {
          source: 'whatsapp-webhook-manager',
          version: '1.0.0',
          ...metadata,
        },
      };

      // Find matching webhooks
      const matchingWebhooks = this.findMatchingWebhooks(eventType, eventData);
      
      if (matchingWebhooks.length === 0) {
        console.log(`📭 No webhooks registered for event: ${eventType}`);
        return;
      }

      console.log(`📤 Triggering ${matchingWebhooks.length} webhooks for event: ${eventType}`);

      // Queue webhook deliveries
      for (const webhook of matchingWebhooks) {
        await this.queueWebhookDelivery(webhook, eventPayload);
      }

      this.stats.totalEvents++;

    } catch (error) {
      console.error('❌ Error triggering webhook:', error);
    }
  }

  /**
   * Check if event should be processed based on filters
   * @param {string} eventType 
   * @param {Object} eventData 
   * @returns {boolean}
   */
  shouldProcessEvent(eventType, eventData) {
    const filters = this.options.filters;
    
    // Check allowed events
    if (filters.allowedEvents.length > 0 && 
        !filters.allowedEvents.includes(eventType) && 
        !filters.allowedEvents.includes('*')) {
      return false;
    }
    
    // Check blocked events
    if (filters.blockedEvents.includes(eventType)) {
      return false;
    }
    
    // Check minimum severity
    if (eventData.severity && 
        !this.meetsMinimumSeverity(eventData.severity, filters.minimumSeverity)) {
      return false;
    }
    
    return true;
  }

  /**
   * Check if severity meets minimum threshold
   * @param {string} eventSeverity 
   * @param {string} minimumSeverity 
   * @returns {boolean}
   */
  meetsMinimumSeverity(eventSeverity, minimumSeverity) {
    const severityLevels = {
      'info': 1,
      'warning': 2,
      'critical': 3,
    };
    
    const eventLevel = severityLevels[eventSeverity] || 0;
    const minLevel = severityLevels[minimumSeverity] || 0;
    
    return eventLevel >= minLevel;
  }

  /**
   * Find webhooks that match the event
   * @param {string} eventType 
   * @param {Object} eventData 
   * @returns {Array} Matching webhook registrations
   */
  findMatchingWebhooks(eventType, eventData) {
    const matchingWebhooks = [];
    
    for (const [webhookId, registration] of this.registrations) {
      if (!registration.enabled) continue;
      
      // Check if webhook listens to this event type
      const listensToEvent = registration.events.includes('*') || 
                           registration.events.includes(eventType);
      
      if (!listensToEvent) continue;
      
      // Apply webhook-specific filters
      if (!this.matchesWebhookFilters(registration, eventData)) continue;
      
      matchingWebhooks.push(registration);
    }
    
    return matchingWebhooks;
  }

  /**
   * Check if event matches webhook-specific filters
   * @param {Object} registration 
   * @param {Object} eventData 
   * @returns {boolean}
   */
  matchesWebhookFilters(registration, eventData) {
    const filters = registration.filters;
    
    // Check severity filter
    if (filters.severity.length > 0 && 
        eventData.severity && 
        !filters.severity.includes(eventData.severity)) {
      return false;
    }
    
    // Check session ID filter
    if (filters.sessionIds.length > 0 && 
        eventData.sessionId && 
        !filters.sessionIds.includes(eventData.sessionId)) {
      return false;
    }
    
    return true;
  }

  /**
   * Queue webhook delivery for processing
   * @param {Object} webhook 
   * @param {Object} payload 
   */
  async queueWebhookDelivery(webhook, payload) {
    // Check rate limits
    if (!this.checkRateLimit(webhook.id)) {
      console.log(`🚫 Rate limit exceeded for webhook: ${webhook.id}`);
      return;
    }

    // Check queue size
    if (this.eventQueue.length >= this.options.queue.maxSize) {
      console.log('⚠️ Webhook queue is full, dropping oldest events');
      this.eventQueue.shift(); // Remove oldest event
    }

    const delivery = {
      id: this.generateDeliveryId(),
      webhookId: webhook.id,
      webhook,
      payload,
      attempts: 0,
      maxAttempts: webhook.retryConfig.maxAttempts,
      nextAttemptAt: new Date(),
      createdAt: new Date(),
    };

    this.eventQueue.push(delivery);
    this.stats.queuedEvents++;
    
    console.log(`📬 Queued webhook delivery: ${delivery.id} for webhook: ${webhook.id}`);
  }

  /**
   * Check rate limit for webhook
   * @param {string} webhookId 
   * @returns {boolean}
   */
  checkRateLimit(webhookId) {
    if (!this.options.rateLimit.enabled) return true;
    
    const now = Date.now();
    const windowStart = now - (60 * 1000); // 1 minute window
    
    if (!this.rateLimitCounters.has(webhookId)) {
      this.rateLimitCounters.set(webhookId, []);
    }
    
    const counter = this.rateLimitCounters.get(webhookId);
    
    // Remove old entries
    const filtered = counter.filter(timestamp => timestamp > windowStart);
    
    // Check burst limit
    const recentRequests = filtered.filter(timestamp => timestamp > (now - 1000)); // Last second
    if (recentRequests.length >= this.options.rateLimit.burstLimit) {
      return false;
    }
    
    // Check per-minute limit
    if (filtered.length >= this.options.rateLimit.requestsPerMinute) {
      return false;
    }
    
    // Add current request
    filtered.push(now);
    this.rateLimitCounters.set(webhookId, filtered);
    
    return true;
  }

  /**
   * Start queue processing
   */
  startQueueProcessing() {
    if (this.processingQueue) return;
    
    this.processingQueue = true;
    
    setInterval(async () => {
      await this.processQueue();
    }, this.options.queue.processingInterval);
    
    console.log('🔄 Started webhook queue processing');
  }

  /**
   * Process webhook delivery queue
   */
  async processQueue() {
    if (this.eventQueue.length === 0) return;
    
    const now = new Date();
    const readyDeliveries = this.eventQueue.filter(delivery => delivery.nextAttemptAt <= now);
    
    if (readyDeliveries.length === 0) return;
    
    // Process batch of deliveries
    const batch = readyDeliveries.slice(0, this.options.queue.batchSize);
    
    const promises = batch.map(delivery => this.processDelivery(delivery));
    await Promise.allSettled(promises);
    
    this.stats.lastProcessedAt = new Date();
  }

  /**
   * Process individual webhook delivery
   * @param {Object} delivery 
   */
  async processDelivery(delivery) {
    try {
      delivery.attempts++;
      
      console.log(`📤 Attempting webhook delivery: ${delivery.id} (attempt ${delivery.attempts}/${delivery.maxAttempts})`);
      
      const success = await this.deliverWebhook(delivery.webhook, delivery.payload);
      
      if (success) {
        // Remove from queue on success
        this.removeFromQueue(delivery.id);
        this.updateWebhookStats(delivery.webhook.id, true);
        this.stats.successfulDeliveries++;
        
        console.log(`✅ Webhook delivery successful: ${delivery.id}`);
        
        this.emit('webhook_delivered', {
          deliveryId: delivery.id,
          webhookId: delivery.webhook.id,
          attempts: delivery.attempts,
        });
        
      } else {
        // Handle retry logic
        if (delivery.attempts >= delivery.maxAttempts) {
          // Max attempts reached, remove from queue
          this.removeFromQueue(delivery.id);
          this.updateWebhookStats(delivery.webhook.id, false);
          this.stats.failedDeliveries++;
          
          console.log(`❌ Webhook delivery failed permanently: ${delivery.id}`);
          
          this.emit('webhook_failed', {
            deliveryId: delivery.id,
            webhookId: delivery.webhook.id,
            attempts: delivery.attempts,
            reason: 'max_attempts_reached',
          });
          
        } else {
          // Schedule retry with exponential backoff
          const delay = this.calculateRetryDelay(delivery.attempts, delivery.webhook.retryConfig);
          delivery.nextAttemptAt = new Date(Date.now() + delay);
          this.stats.retries++;
          
          console.log(`🔄 Scheduling retry for webhook delivery: ${delivery.id} in ${delay}ms`);
        }
      }
      
    } catch (error) {
      console.error(`❌ Error processing webhook delivery ${delivery.id}:`, error);
    }
  }

  /**
   * Deliver webhook to endpoint
   * @param {Object} webhook 
   * @param {Object} payload 
   * @returns {boolean} Success status
   */
  async deliverWebhook(webhook, payload) {
    try {
      const headers = { ...webhook.headers };
      
      // Add signature if enabled
      if (this.options.security.enableSignature && webhook.secret) {
        const signature = this.generateSignature(payload, webhook.secret);
        headers[this.options.security.headerName] = signature;
      }
      
      // Add webhook ID header
      headers['X-Webhook-ID'] = webhook.id;
      headers['X-Delivery-ID'] = this.generateDeliveryId();
      
      const response = await axios.post(webhook.url, payload, {
        headers,
        timeout: this.options.timeout.request,
        validateStatus: (status) => status >= 200 && status < 300,
      });
      
      console.log(`📡 Webhook delivered successfully to ${webhook.url}: ${response.status}`);
      
      return true;
      
    } catch (error) {
      console.error(`❌ Webhook delivery failed to ${webhook.url}:`, error.message);
      
      // Check if it's a client error (4xx) - don't retry these
      if (error.response && error.response.status >= 400 && error.response.status < 500) {
        console.log(`🚫 Client error (${error.response.status}), not retrying`);
        return true; // Treat as "successful" to avoid retries
      }
      
      return false;
    }
  }

  /**
   * Generate signature for webhook payload
   * @param {Object} payload 
   * @param {string} secret 
   * @returns {string} Signature
   */
  generateSignature(payload, secret) {
    const payloadString = JSON.stringify(payload);
    const algorithm = this.options.security.algorithm;
    
    return `${algorithm}=${crypto
      .createHmac(algorithm, secret)
      .update(payloadString)
      .digest('hex')}`;
  }

  /**
   * Calculate retry delay with exponential backoff
   * @param {number} attempt 
   * @param {Object} retryConfig 
   * @returns {number} Delay in milliseconds
   */
  calculateRetryDelay(attempt, retryConfig) {
    const baseDelay = retryConfig.baseDelay;
    const exponentialDelay = baseDelay * Math.pow(retryConfig.exponentialFactor, attempt - 1);
    const maxDelay = retryConfig.maxDelay;
    
    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 1000;
    
    return Math.min(exponentialDelay, maxDelay) + jitter;
  }

  /**
   * Remove delivery from queue
   * @param {string} deliveryId 
   */
  removeFromQueue(deliveryId) {
    const index = this.eventQueue.findIndex(delivery => delivery.id === deliveryId);
    if (index !== -1) {
      this.eventQueue.splice(index, 1);
      this.stats.queuedEvents = Math.max(0, this.stats.queuedEvents - 1);
    }
  }

  /**
   * Update webhook statistics
   * @param {string} webhookId 
   * @param {boolean} success 
   */
  updateWebhookStats(webhookId, success) {
    const webhook = this.registrations.get(webhookId);
    if (!webhook) return;
    
    webhook.totalDeliveries++;
    webhook.lastTriggered = new Date();
    
    if (success) {
      webhook.successfulDeliveries++;
    } else {
      webhook.failedDeliveries++;
    }
  }

  /**
   * Start rate limit cleanup
   */
  startRateLimitCleanup() {
    setInterval(() => {
      const now = Date.now();
      const cutoff = now - (60 * 1000); // 1 minute ago
      
      for (const [webhookId, counter] of this.rateLimitCounters) {
        const filtered = counter.filter(timestamp => timestamp > cutoff);
        
        if (filtered.length === 0) {
          this.rateLimitCounters.delete(webhookId);
        } else {
          this.rateLimitCounters.set(webhookId, filtered);
        }
      }
    }, 30000); // Cleanup every 30 seconds
    
    console.log('🧹 Started rate limit cleanup');
  }

  /**
   * Get webhook statistics
   * @param {string} webhookId - Optional specific webhook ID
   * @returns {Object} Statistics
   */
  getStatistics(webhookId = null) {
    if (webhookId) {
      const webhook = this.registrations.get(webhookId);
      if (!webhook) return null;
      
      return {
        webhookId,
        totalDeliveries: webhook.totalDeliveries,
        successfulDeliveries: webhook.successfulDeliveries,
        failedDeliveries: webhook.failedDeliveries,
        successRate: webhook.totalDeliveries > 0 ? 
          ((webhook.successfulDeliveries / webhook.totalDeliveries) * 100).toFixed(2) : 0,
        lastTriggered: webhook.lastTriggered,
        enabled: webhook.enabled,
      };
    }
    
    return {
      global: this.stats,
      webhooks: {
        total: this.registrations.size,
        enabled: Array.from(this.registrations.values()).filter(w => w.enabled).length,
        disabled: Array.from(this.registrations.values()).filter(w => !w.enabled).length,
      },
      queue: {
        size: this.eventQueue.length,
        processing: this.processingQueue,
      },
      rateLimit: {
        activeCounters: this.rateLimitCounters.size,
      },
    };
  }

  /**
   * Get all webhook registrations
   * @returns {Array} Webhook registrations
   */
  getWebhooks() {
    return Array.from(this.registrations.values()).map(webhook => ({
      ...webhook,
      secret: '[HIDDEN]', // Don't expose secrets
    }));
  }

  /**
   * Test webhook endpoint
   * @param {string} webhookId 
   * @returns {Object} Test result
   */
  async testWebhook(webhookId) {
    const webhook = this.registrations.get(webhookId);
    if (!webhook) {
      throw new Error(`Webhook ${webhookId} not found`);
    }
    
    const testPayload = {
      event: 'webhook_test',
      timestamp: new Date().toISOString(),
      data: {
        message: 'This is a test webhook delivery',
        webhookId,
      },
      metadata: {
        source: 'whatsapp-webhook-manager',
        test: true,
      },
    };
    
    const startTime = Date.now();
    const success = await this.deliverWebhook(webhook, testPayload);
    const duration = Date.now() - startTime;
    
    return {
      success,
      duration,
      webhookId,
      timestamp: new Date(),
    };
  }

  /**
   * Validate URL format
   * @param {string} url 
   * @returns {boolean}
   */
  isValidUrl(url) {
    try {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  }

  /**
   * Generate webhook ID
   * @returns {string}
   */
  generateWebhookId() {
    return `webhook_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate delivery ID
   * @returns {string}
   */
  generateDeliveryId() {
    return `delivery_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    // Clear rate limit counters
    this.rateLimitCounters.clear();
    
    // Clear old queue items (older than 1 hour)
    const cutoff = new Date(Date.now() - (60 * 60 * 1000));
    this.eventQueue = this.eventQueue.filter(delivery => delivery.createdAt > cutoff);
    
    console.log('🧹 WebhookManager cleanup completed');
  }
}

module.exports = WebhookManager;