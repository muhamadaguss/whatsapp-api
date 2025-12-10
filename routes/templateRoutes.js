const express = require('express');
const { verifyToken } = require('../middleware/authMiddleware');
const { getTemplates, createTemplate, updateTemplate, deleteTemplate } = require('../controllers/templateController');
const router = express.Router();
router.get('/',verifyToken, getTemplates)
router.post('/',verifyToken, createTemplate)
router.put('/', verifyToken, updateTemplate);
router.delete('/', verifyToken, deleteTemplate);
module.exports = router;
