const logger = require('./logger');

/**
 * Database health check utility
 */
class DatabaseHealthCheck {
  constructor(sequelize) {
    this.sequelize = sequelize;
    this.isHealthy = false;
    this.lastCheck = null;
    this.checkInterval = null;
  }

  /**
   * Perform a single health check
   */
  async performCheck() {
    try {
      await this.sequelize.authenticate();
      this.isHealthy = true;
      this.lastCheck = new Date();
      return { healthy: true, timestamp: this.lastCheck };
    } catch (error) {
      this.isHealthy = false;
      this.lastCheck = new Date();
      logger.error('Database health check failed:', error.message);
      return { 
        healthy: false, 
        timestamp: this.lastCheck, 
        error: error.message 
      };
    }
  }

  /**
   * Start periodic health checks
   */
  startPeriodicCheck(intervalMs = 30000) {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    this.checkInterval = setInterval(async () => {
      const result = await this.performCheck();
      if (!result.healthy) {
        logger.warn('⚠️  Database connection lost. Attempting to reconnect...');
      }
    }, intervalMs);

    logger.info(`🔄 Database health check started (interval: ${intervalMs}ms)`);
  }

  /**
   * Stop periodic health checks
   */
  stopPeriodicCheck() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      logger.info('🛑 Database health check stopped');
    }
  }

  /**
   * Get current health status
   */
  getStatus() {
    return {
      healthy: this.isHealthy,
      lastCheck: this.lastCheck,
      uptime: this.lastCheck ? Date.now() - this.lastCheck.getTime() : null
    };
  }
}

/**
 * Test database connection with retry logic
 */
async function testDatabaseConnection(sequelize, maxRetries = 5, retryDelay = 2000) {
  logger.info('🔍 Testing database connection...');
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await sequelize.authenticate();
      logger.info('✅ Database connection successful');
      return true;
    } catch (error) {
      logger.error(`❌ Database connection attempt ${attempt}/${maxRetries} failed:`, error.message);
      
      if (attempt === maxRetries) {
        logger.error('💥 All database connection attempts failed');
        throw new Error(`Database connection failed after ${maxRetries} attempts: ${error.message}`);
      }
      
      logger.info(`⏳ Retrying in ${retryDelay}ms...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
}

/**
 * Validate database configuration
 */
function validateDatabaseConfig() {
  const requiredVars = ['DB_NAME', 'DB_USER', 'DB_PASS', 'DB_HOST'];
  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required database environment variables: ${missing.join(', ')}`);
  }

  // Validate DB_PORT if provided
  if (process.env.DB_PORT && isNaN(parseInt(process.env.DB_PORT))) {
    throw new Error('DB_PORT must be a valid number');
  }

  logger.info('✅ Database configuration validated');
}

module.exports = {
  DatabaseHealthCheck,
  testDatabaseConnection,
  validateDatabaseConfig
};