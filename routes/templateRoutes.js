const express = require('express');
const { verifyToken } = require('../middleware/authMiddleware');
const { tenantContext } = require('../middleware/tenantContext');
const { withTenantContext } = require('../middleware/tenantIsolation');
const quotaService = require('../services/quotaService');
const { getTemplates, createTemplate, updateTemplate, deleteTemplate } = require('../controllers/templateController');
const router = express.Router();

router.get('/', verifyToken, tenantContext, withTenantContext, getTemplates);
router.post('/', verifyToken, tenantContext, withTenantContext, quotaService.requireQuota('templates', 1), createTemplate);
router.put('/', verifyToken, tenantContext, withTenantContext, updateTemplate);
router.delete('/', verifyToken, tenantContext, withTenantContext, deleteTemplate);

module.exports = router;