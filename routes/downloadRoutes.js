const express = require('express')
const router = express.Router()
const { downloadTemplate } = require("../controllers/downloadController");
const { verifyToken } = require("../middleware/authMiddleware");
router.get('/',verifyToken,downloadTemplate)
module.exports = router
