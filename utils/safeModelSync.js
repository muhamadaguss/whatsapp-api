const logger = require("./logger");

/**
 * Safe Model Sync Utility
 * Handles model sync with better error handling
 */

/**
 * Safely sync a model, skip if table already exists
 * @param {Object} model - Sequelize model
 * @param {Object} options - Sync options
 * @returns {Promise<boolean>} - Success status
 */
async function safeSync(model, options = {}) {
  try {
    const tableName = model.getTableName();

    // Check if table exists
    const [results] = await model.sequelize.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = '${tableName}'
      );
    `);

    const tableExists = results[0].exists;

    if (tableExists && options.alter) {
      logger.info(
        `⏭️  Table ${tableName} already exists, skipping alter to avoid conflicts`
      );
      return true;
    }

    // Sync model
    await model.sync(options);
    logger.info(`✅ Model ${model.name} synced successfully`);
    return true;
  } catch (error) {
    logger.error(`❌ Error syncing model ${model.name}:`, error.message);

    // If it's the "Cannot read properties of null" error, skip it
    if (error.message.includes("Cannot read properties of null")) {
      logger.warn(
        `⚠️  Skipping ${model.name} sync due to known Sequelize issue`
      );
      return true; // Return true to continue
    }

    throw error;
  }
}

/**
 * Sync multiple models safely
 * @param {Array} models - Array of Sequelize models
 * @param {Object} options - Sync options
 * @returns {Promise<Object>} - Results object
 */
async function safeSyncAll(models, options = {}) {
  const results = {
    success: [],
    failed: [],
    skipped: [],
  };

  for (const model of models) {
    try {
      const synced = await safeSync(model, options);
      if (synced) {
        results.success.push(model.name);
      } else {
        results.skipped.push(model.name);
      }
    } catch (error) {
      results.failed.push({ model: model.name, error: error.message });
    }
  }

  return results;
}

module.exports = {
  safeSync,
  safeSyncAll,
};
