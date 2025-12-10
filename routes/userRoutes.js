const express = require('express')
const { getUsers, updateActive } = require('../controllers/userController')
const { verifyToken } = require('../middleware/authMiddleware')
const router = express.Router()
router.get('/allUsers',verifyToken, getUsers)
router.patch('/updateActive/:id',verifyToken, updateActive)
module.exports = router
