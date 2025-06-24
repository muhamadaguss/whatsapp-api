const express = require('express')
const router = express.Router()
const multer = require('multer')
const path = require('path')
const { verifyToken } = require('../middleware/authMiddleware')
const {
    getQRImage,
    sendMessageWA,
    uploadExcel,
    logoutSession,
    getActiveSessions,
} = require('../controllers/whatsappController')

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, 'uploads/') // pastikan folder ini ada
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname))
    }
})

const upload = multer({ storage })


router.get('/qr-image/:sessionId',verifyToken, getQRImage)
router.post('/send-message',verifyToken, sendMessageWA)
router.post('/upload/:sessionId',verifyToken, upload.single('excel'), uploadExcel)
router.post('/logoutSession/:sessionId',verifyToken, logoutSession)
router.get('/sessions',verifyToken,getActiveSessions)

module.exports = router
