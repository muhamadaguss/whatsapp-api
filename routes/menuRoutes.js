const express = require('express')
const { verifyToken } = require('../middleware/authMiddleware')
const { getMenu,createMenu,updateMenu } = require('../controllers/menuController')
const router = express.Router()

router.get('/',verifyToken,getMenu)
router.post('/',verifyToken,createMenu)
router.put('/:id',verifyToken,updateMenu)

module.exports = router