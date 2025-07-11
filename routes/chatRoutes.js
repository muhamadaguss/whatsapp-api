const express = require('express');
const router = express.Router();
const { getAllChats } = require('../controllers/chatController');

router.get('/:sessionId', getAllChats);

module.exports = router;