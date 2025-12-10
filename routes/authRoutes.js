const express = require('express')
const router = express.Router()
const {
    login,
    register,
    verify,
    hashPassword,
    logout
} = require('../controllers/authController')
const { verifyToken } = require('../middleware/authMiddleware')
router.post('/login', login)
router.post('/register', register)
router.get('/verify', verifyToken, verify)
router.post('/hash-password',hashPassword)
router.post('/logout',verifyToken,logout)
module.exports = router
