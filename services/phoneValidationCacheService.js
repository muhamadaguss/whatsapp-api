const logger = require("../utils/logger");
const PhoneValidationCache = require("../models/phoneValidationCacheModel");
class PhoneValidationCacheService {
  constructor() {
    this.memoryCache = new Map();
    this.memoryCacheTTL = 3600000; 
    this.redisClient = null;
    this.redisCacheTTL = 86400; 
    this.validationQueue = [];
    this.isValidating = false;
    this.progressiveValidationActive = false;
    this.stats = {
      hits: { memory: 0, redis: 0, database: 0 },
      misses: 0,
      validations: 0
    };
    this.initializeRedis();
  }
  async initializeRedis() {
    try {
      const redis = require("redis");
      this.redisClient = redis.createClient({
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        retry_strategy: () => null 
      });
      await this.redisClient.connect();
      logger.info('[PhoneCache] Redis cache layer initialized');
    } catch (error) {
      logger.warn('[PhoneCache] Redis not available, using memory + database only');
      this.redisClient = null;
    }
  }
  async validatePhone(phoneNumber, sock, skipValidation = false) {
    const startTime = Date.now();
    try {
      const memoryCached = this.getFromMemoryCache(phoneNumber);
      if (memoryCached) {
        this.stats.hits.memory++;
        logger.debug(`[PhoneCache] L1 HIT (memory): ${phoneNumber} (${Date.now() - startTime}ms)`);
        return memoryCached;
      }
      if (this.redisClient) {
        const redisCached = await this.getFromRedisCache(phoneNumber);
        if (redisCached) {
          this.stats.hits.redis++;
          this.setInMemoryCache(phoneNumber, redisCached);
          logger.debug(`[PhoneCache] L2 HIT (redis): ${phoneNumber} (${Date.now() - startTime}ms)`);
          return redisCached;
        }
      }
      const dbCached = await this.getFromDatabaseCache(phoneNumber);
      if (dbCached) {
        this.stats.hits.database++;
        this.setInMemoryCache(phoneNumber, dbCached);
        if (this.redisClient) {
          await this.setInRedisCache(phoneNumber, dbCached);
        }
        logger.debug(`[PhoneCache] L3 HIT (database): ${phoneNumber} (${Date.now() - startTime}ms)`);
        return dbCached;
      }
      this.stats.misses++;
      if (skipValidation) {
        return {
          exists: false,
          phoneNumber,
          cached: false,
          message: 'Validation skipped - not in cache'
        };
      }
      const validationResult = await this.performValidation(phoneNumber, sock);
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
  getFromMemoryCache(phoneNumber) {
    const cached = this.memoryCache.get(phoneNumber);
    if (!cached) return null;
    if (Date.now() - cached.timestamp > this.memoryCacheTTL) {
      this.memoryCache.delete(phoneNumber);
      return null;
    }
    return { ...cached.result, cached: true, cacheLayer: 'memory' };
  }
  setInMemoryCache(phoneNumber, result) {
    this.memoryCache.set(phoneNumber, {
      result,
      timestamp: Date.now()
    });
  }
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
  async getFromDatabaseCache(phoneNumber) {
    try {
      const cached = await PhoneValidationCache.findOne({
        where: { phone_number: phoneNumber }
      });
      if (!cached) return null;
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      if (cached.validated_at < sevenDaysAgo) {
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
  async cacheValidationResult(phoneNumber, result) {
    this.setInMemoryCache(phoneNumber, result);
    if (this.redisClient) {
      await this.setInRedisCache(phoneNumber, result);
    }
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
  addToValidationQueue(phoneNumbers, sock) {
    const newNumbers = phoneNumbers.filter(phone => {
      const cached = this.getFromMemoryCache(phone);
      return !cached;
    });
    if (newNumbers.length > 0) {
      this.validationQueue.push(...newNumbers.map(phone => ({ phone, sock })));
      logger.info(`[PhoneCache] Added ${newNumbers.length} numbers to background queue (total: ${this.validationQueue.length})`);
      if (!this.isValidating) {
        this.processValidationQueue();
      }
    }
  }
  async processValidationQueue() {
    if (this.isValidating || this.validationQueue.length === 0) {
      return;
    }
    this.isValidating = true;
    logger.info(`[PhoneCache] Starting background validation of ${this.validationQueue.length} numbers`);
    while (this.validationQueue.length > 0) {
      const item = this.validationQueue.shift();
      try {
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
  async startProgressiveValidation(phoneNumbers, sock, durationMs = 3600000) {
    if (this.progressiveValidationActive) {
      logger.warn('[PhoneCache] Progressive validation already running');
      return;
    }
    this.progressiveValidationActive = true;
    const uncachedNumbers = [];
    for (const phone of phoneNumbers) {
      const cached = await this.validatePhone(phone, sock, true); 
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
  async warmCache(phoneNumbers, sock) {
    logger.info(`[PhoneCache] Warming cache with ${phoneNumbers.length} numbers`);
    await this.startProgressiveValidation(phoneNumbers, sock, 1800000);
  }
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
  clearMemoryCache() {
    const size = this.memoryCache.size;
    this.memoryCache.clear();
    logger.info(`[PhoneCache] Cleared memory cache (${size} entries)`);
  }
  async clearAllCaches() {
    this.clearMemoryCache();
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
    try {
      const count = await PhoneValidationCache.destroy({ where: {}, truncate: true });
      logger.info(`[PhoneCache] Cleared database cache (${count} entries)`);
    } catch (error) {
      logger.warn('[PhoneCache] Error clearing database:', error.message);
    }
  }
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  async close() {
    if (this.redisClient) {
      await this.redisClient.quit();
      logger.info('[PhoneCache] Redis connection closed');
    }
  }
}
let instance = null;
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
