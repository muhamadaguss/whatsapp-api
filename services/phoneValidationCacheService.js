/**
 * Phone Validation Cache Service - PHASE 3 TASK [P3-3]
 * 
 * Multi-Layer Caching System for Phone Number Validation
 * 
 * Cache Layers:
 * 1. Memory Cache (L1): Instant access, TTL 1 hour
 * 2. Redis Cache (L2): Fast access, TTL 24 hours  
 * 3. Database Cache (L3): Persistent, TTL 7 days
 * 
 * Features:
 * - Background validation (non-blocking)
 * - Progressive validation (spread over time)
 * - Automatic cache warming
 * - Zero validation spike patterns
 * 
 * @module phoneValidationCacheService
 */

const logger = require("../utils/logger");
const PhoneValidationCache = require("../models/phoneValidationCacheModel");

class PhoneValidationCacheService {
  constructor() {
    // Layer 1: Memory Cache (fastest)
    this.memoryCache = new Map();
    this.memoryCacheTTL = 3600000; // 1 hour in ms
    
    // Layer 2: Redis Cache (optional, falls back to memory if not available)
    this.redisClient = null;
    this.redisCacheTTL = 86400; // 24 hours in seconds
    
    // Background validation queue
    this.validationQueue = [];
    this.isValidating = false;
    this.progressiveValidationActive = false;
    
    // Statistics
    this.stats = {
      hits: { memory: 0, redis: 0, database: 0 },
      misses: 0,
      validations: 0
    };
    
    // Initialize Redis if available
    this.initializeRedis();
  }

  /**
   * Initialize Redis connection (optional)
   */
  async initializeRedis() {
    try {
      // Try to load Redis client if available
      const redis = require("redis");
      this.redisClient = redis.createClient({
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        retry_strategy: () => null // Don't retry, fall back to memory
      });
      
      await this.redisClient.connect();
      logger.info('[PhoneCache] Redis cache layer initialized');
    } catch (error) {
      logger.warn('[PhoneCache] Redis not available, using memory + database only');
      this.redisClient = null;
    }
  }

  /**
   * Validate phone number with multi-layer caching
   * @param {string} phoneNumber - Phone number to validate
   * @param {Object} sock - WhatsApp socket connection
   * @param {boolean} skipValidation - Skip actual validation (use cache only)
   * @returns {Promise<Object>} Validation result
   */
  async validatePhone(phoneNumber, sock, skipValidation = false) {
    const startTime = Date.now();
    
    try {
      // Layer 1: Check memory cache
      const memoryCached = this.getFromMemoryCache(phoneNumber);
      if (memoryCached) {
        this.stats.hits.memory++;
        logger.debug(`[PhoneCache] L1 HIT (memory): ${phoneNumber} (${Date.now() - startTime}ms)`);
        return memoryCached;
      }
      
      // Layer 2: Check Redis cache
      if (this.redisClient) {
        const redisCached = await this.getFromRedisCache(phoneNumber);
        if (redisCached) {
          this.stats.hits.redis++;
          // Store in memory for next time
          this.setInMemoryCache(phoneNumber, redisCached);
          logger.debug(`[PhoneCache] L2 HIT (redis): ${phoneNumber} (${Date.now() - startTime}ms)`);
          return redisCached;
        }
      }
      
      // Layer 3: Check database cache
      const dbCached = await this.getFromDatabaseCache(phoneNumber);
      if (dbCached) {
        this.stats.hits.database++;
        // Store in upper layers for next time
        this.setInMemoryCache(phoneNumber, dbCached);
        if (this.redisClient) {
          await this.setInRedisCache(phoneNumber, dbCached);
        }
        logger.debug(`[PhoneCache] L3 HIT (database): ${phoneNumber} (${Date.now() - startTime}ms)`);
        return dbCached;
      }
      
      // Cache miss - need to validate
      this.stats.misses++;
      
      if (skipValidation) {
        // Return unknown if skipping validation
        return {
          exists: false,
          phoneNumber,
          cached: false,
          message: 'Validation skipped - not in cache'
        };
      }
      
      // Perform actual validation
      const validationResult = await this.performValidation(phoneNumber, sock);
      
      // Store in all cache layers
      await this.cacheValidationResult(phoneNumber, validationResult);
      
      logger.info(`[PhoneCache] VALIDATED: ${phoneNumber} - exists: ${validationResult.exists} (${Date.now() - startTime}ms)`);
      
      return validationResult;
      
    } catch (error) {
      logger.error(`[PhoneCache] Error validating ${phoneNumber}:`, error);
      return {
        exists: false,
        phoneNumber,
        error: error.message,
        cached: false
      };
    }
  }

  /**
   * Get from memory cache (Layer 1)
   * @param {string} phoneNumber - Phone number
   * @returns {Object|null} Cached result or null
   */
  getFromMemoryCache(phoneNumber) {
    const cached = this.memoryCache.get(phoneNumber);
    
    if (!cached) return null;
    
    // Check if expired
    if (Date.now() - cached.timestamp > this.memoryCacheTTL) {
      this.memoryCache.delete(phoneNumber);
      return null;
    }
    
    return { ...cached.result, cached: true, cacheLayer: 'memory' };
  }

  /**
   * Set in memory cache (Layer 1)
   * @param {string} phoneNumber - Phone number
   * @param {Object} result - Validation result
   */
  setInMemoryCache(phoneNumber, result) {
    this.memoryCache.set(phoneNumber, {
      result,
      timestamp: Date.now()
    });
  }

  /**
   * Get from Redis cache (Layer 2)
   * @param {string} phoneNumber - Phone number
   * @returns {Promise<Object|null>} Cached result or null
   */
  async getFromRedisCache(phoneNumber) {
    if (!this.redisClient) return null;
    
    try {
      const cached = await this.redisClient.get(`phone:${phoneNumber}`);
      if (!cached) return null;
      
      const result = JSON.parse(cached);
      return { ...result, cached: true, cacheLayer: 'redis' };
    } catch (error) {
      logger.warn(`[PhoneCache] Redis get error:`, error.message);
      return null;
    }
  }

  /**
   * Set in Redis cache (Layer 2)
   * @param {string} phoneNumber - Phone number
   * @param {Object} result - Validation result
   */
  async setInRedisCache(phoneNumber, result) {
    if (!this.redisClient) return;
    
    try {
      await this.redisClient.setEx(
        `phone:${phoneNumber}`,
        this.redisCacheTTL,
        JSON.stringify(result)
      );
    } catch (error) {
      logger.warn(`[PhoneCache] Redis set error:`, error.message);
    }
  }

  /**
   * Get from database cache (Layer 3)
   * @param {string} phoneNumber - Phone number
   * @returns {Promise<Object|null>} Cached result or null
   */
  async getFromDatabaseCache(phoneNumber) {
    try {
      const cached = await PhoneValidationCache.findOne({
        where: { phone_number: phoneNumber }
      });
      
      if (!cached) return null;
      
      // Check if expired (7 days)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      if (cached.validated_at < sevenDaysAgo) {
        // Expired - delete and return null
        await cached.destroy();
        return null;
      }
      
      return {
        exists: cached.exists,
        phoneNumber: cached.phone_number,
        jid: cached.jid,
        validatedAt: cached.validated_at,
        cached: true,
        cacheLayer: 'database'
      };
      
    } catch (error) {
      logger.warn(`[PhoneCache] Database get error:`, error.message);
      return null;
    }
  }

  /**
   * Cache validation result in all layers
   * @param {string} phoneNumber - Phone number
   * @param {Object} result - Validation result
   */
  async cacheValidationResult(phoneNumber, result) {
    // Layer 1: Memory
    this.setInMemoryCache(phoneNumber, result);
    
    // Layer 2: Redis
    if (this.redisClient) {
      await this.setInRedisCache(phoneNumber, result);
    }
    
    // Layer 3: Database
    try {
      await PhoneValidationCache.upsert({
        phone_number: phoneNumber,
        exists: result.exists,
        jid: result.jid || null,
        validated_at: new Date()
      });
    } catch (error) {
      logger.warn(`[PhoneCache] Database cache error:`, error.message);
    }
  }

  /**
   * Perform actual phone validation
   * @param {string} phoneNumber - Phone number
   * @param {Object} sock - WhatsApp socket
   * @returns {Promise<Object>} Validation result
   */
  async performValidation(phoneNumber, sock) {
    this.stats.validations++;
    
    try {
      const [result] = await sock.onWhatsApp(phoneNumber);
      
      return {
        exists: result?.exists || false,
        phoneNumber: phoneNumber,
        jid: result?.jid || null,
        cached: false
      };
    } catch (error) {
      throw new Error(`Validation failed: ${error.message}`);
    }
  }

  /**
   * Add phone numbers to background validation queue
   * @param {Array<string>} phoneNumbers - Phone numbers to validate
   * @param {Object} sock - WhatsApp socket
   */
  addToValidationQueue(phoneNumbers, sock) {
    const newNumbers = phoneNumbers.filter(phone => {
      // Only add if not already in cache
      const cached = this.getFromMemoryCache(phone);
      return !cached;
    });
    
    if (newNumbers.length > 0) {
      this.validationQueue.push(...newNumbers.map(phone => ({ phone, sock })));
      logger.info(`[PhoneCache] Added ${newNumbers.length} numbers to background queue (total: ${this.validationQueue.length})`);
      
      // Start processing if not already running
      if (!this.isValidating) {
        this.processValidationQueue();
      }
    }
  }

  /**
   * Process validation queue in background
   */
  async processValidationQueue() {
    if (this.isValidating || this.validationQueue.length === 0) {
      return;
    }
    
    this.isValidating = true;
    logger.info(`[PhoneCache] Starting background validation of ${this.validationQueue.length} numbers`);
    
    while (this.validationQueue.length > 0) {
      const item = this.validationQueue.shift();
      
      try {
        // Validate with random delay (3-5s) to avoid spike pattern
        const delay = 3000 + Math.random() * 2000;
        await this.sleep(delay);
        
        await this.validatePhone(item.phone, item.sock, false);
        
      } catch (error) {
        logger.warn(`[PhoneCache] Background validation error for ${item.phone}:`, error.message);
      }
    }
    
    this.isValidating = false;
    logger.info(`[PhoneCache] Background validation completed`);
  }

  /**
   * Start progressive validation (spread validation over time)
   * @param {Array<string>} phoneNumbers - Phone numbers to validate
   * @param {Object} sock - WhatsApp socket
   * @param {number} durationMs - Duration to spread validation over (default 1 hour)
   */
  async startProgressiveValidation(phoneNumbers, sock, durationMs = 3600000) {
    if (this.progressiveValidationActive) {
      logger.warn('[PhoneCache] Progressive validation already running');
      return;
    }
    
    this.progressiveValidationActive = true;
    
    const uncachedNumbers = [];
    for (const phone of phoneNumbers) {
      const cached = await this.validatePhone(phone, sock, true); // Check cache only
      if (!cached.cached) {
        uncachedNumbers.push(phone);
      }
    }
    
    if (uncachedNumbers.length === 0) {
      logger.info('[PhoneCache] All numbers already cached, no progressive validation needed');
      this.progressiveValidationActive = false;
      return;
    }
    
    const delayBetween = durationMs / uncachedNumbers.length;
    logger.info(`[PhoneCache] Starting progressive validation: ${uncachedNumbers.length} numbers over ${durationMs/60000} minutes (${delayBetween/1000}s each)`);
    
    for (let i = 0; i < uncachedNumbers.length; i++) {
      try {
        await this.validatePhone(uncachedNumbers[i], sock, false);
        
        // Add random jitter (±20%)
        const jitter = delayBetween * (0.8 + Math.random() * 0.4);
        await this.sleep(jitter);
        
        if (i % 10 === 0) {
          logger.info(`[PhoneCache] Progressive validation: ${i}/${uncachedNumbers.length} (${Math.round(i/uncachedNumbers.length*100)}%)`);
        }
      } catch (error) {
        logger.warn(`[PhoneCache] Error in progressive validation:`, error.message);
      }
    }
    
    this.progressiveValidationActive = false;
    logger.info('[PhoneCache] Progressive validation completed');
  }

  /**
   * Warm cache with phone numbers
   * @param {Array<string>} phoneNumbers - Phone numbers to warm
   * @param {Object} sock - WhatsApp socket
   */
  async warmCache(phoneNumbers, sock) {
    logger.info(`[PhoneCache] Warming cache with ${phoneNumbers.length} numbers`);
    
    // Start progressive validation (spread over 30 minutes)
    await this.startProgressiveValidation(phoneNumbers, sock, 1800000);
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  getCacheStats() {
    const totalHits = this.stats.hits.memory + this.stats.hits.redis + this.stats.hits.database;
    const totalRequests = totalHits + this.stats.misses;
    const hitRate = totalRequests > 0 ? (totalHits / totalRequests * 100).toFixed(2) : 0;
    
    return {
      hits: {
        memory: this.stats.hits.memory,
        redis: this.stats.hits.redis,
        database: this.stats.hits.database,
        total: totalHits
      },
      misses: this.stats.misses,
      totalRequests,
      hitRate: `${hitRate}%`,
      cacheSize: {
        memory: this.memoryCache.size,
        queueLength: this.validationQueue.length
      },
      validations: this.stats.validations,
      backgroundActive: this.isValidating,
      progressiveActive: this.progressiveValidationActive
    };
  }

  /**
   * Clear memory cache
   */
  clearMemoryCache() {
    const size = this.memoryCache.size;
    this.memoryCache.clear();
    logger.info(`[PhoneCache] Cleared memory cache (${size} entries)`);
  }

  /**
   * Clear all caches (memory, redis, database)
   */
  async clearAllCaches() {
    // Clear memory
    this.clearMemoryCache();
    
    // Clear Redis
    if (this.redisClient) {
      try {
        const keys = await this.redisClient.keys('phone:*');
        if (keys.length > 0) {
          await this.redisClient.del(keys);
          logger.info(`[PhoneCache] Cleared Redis cache (${keys.length} keys)`);
        }
      } catch (error) {
        logger.warn('[PhoneCache] Error clearing Redis:', error.message);
      }
    }
    
    // Clear database
    try {
      const count = await PhoneValidationCache.destroy({ where: {}, truncate: true });
      logger.info(`[PhoneCache] Cleared database cache (${count} entries)`);
    } catch (error) {
      logger.warn('[PhoneCache] Error clearing database:', error.message);
    }
  }

  /**
   * Sleep helper
   * @param {number} ms - Milliseconds to sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Close Redis connection
   */
  async close() {
    if (this.redisClient) {
      await this.redisClient.quit();
      logger.info('[PhoneCache] Redis connection closed');
    }
  }
}

// Singleton instance
let instance = null;

/**
 * Get singleton instance of PhoneValidationCacheService
 * @returns {PhoneValidationCacheService}
 */
function getPhoneValidationCacheService() {
  if (!instance) {
    instance = new PhoneValidationCacheService();
  }
  return instance;
}

module.exports = {
  PhoneValidationCacheService,
  getPhoneValidationCacheService
};
