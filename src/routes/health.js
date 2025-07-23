const express = require('express');
const router = express.Router();
const { sequelize } = require('../models');

// Health check endpoint
router.get('/health', async (req, res) => {
  try {
    // Check database connection
    await sequelize.authenticate();
    
    return res.status(200).json({
      status: 'ok',
      message: 'Service is healthy',
      timestamp: new Date().toISOString(),
      database: 'connected'
    });
  } catch (error) {
    console.error('Health check failed:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Service is unhealthy',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: error.message
    });
  }
});

module.exports = router;