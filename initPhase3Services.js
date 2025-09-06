const AutoRetryService = require('./services/autoRetryService');
const logger = require('./utils/logger');

/**
 * Initialize Phase 3 Services
 * Call this function when the application starts
 */
async function initializePhase3Services() {
  try {
    logger.info('🚀 Initializing Phase 3 Services...');

    // Initialize Auto Retry Service
    await AutoRetryService.initialize();
    logger.info('✅ Auto Retry Service initialized');

    logger.info('✅ All Phase 3 Services initialized successfully');

  } catch (error) {
    logger.error('❌ Failed to initialize Phase 3 Services:', error);
    throw error;
  }
}

module.exports = {
  initializePhase3Services
};
