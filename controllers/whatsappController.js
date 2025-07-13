const {
  getSock,
  waitForQRCode,
  startWhatsApp,
  getActiveSessionIds,
  cleanupSession,
} = require('../auth/session')
const path = require('path')
const { processExcelAndSendMessages } = require('../services/excelService')
const fs = require('fs')
const logger = require('../utils/logger')
const SessionModel = require('../models/sessionModel')
const UserModel = require('../models/userModel')

const getQRImage = async (req, res) => {
  const { sessionId } = req.params

  if (!getSock(sessionId)) {
    await startWhatsApp(sessionId,req.user?.id) // QR akan otomatis ter-generate
  }

  const qrData = await waitForQRCode(sessionId)
  if (qrData) {
    const base64 = qrData.replace(/^data:image\/png;base64,/, '')
    // res.setHeader('Content-Type', 'image/png')
    // res.end(Buffer.from(base64, 'base64'))
    return res.status(200).json({
      status: 'success',
      qrCode: base64, // Mengembalikan QR code dalam bentuk base64
    });
  } else {
    res.status(404).json({ status: 'error', message: 'QR belum tersedia' })
  }
}


const sendMessageWA = async (req, res) => {
  const { phone, message, sessionId } = req.body
  console.log('📞 Mengirim pesan ke:', phone, 'dengan pesan:', message, 'pada session:', sessionId)
  if (!phone || !message || !sessionId) return res.status(400).send('Nomor, pesan, dan sessionId wajib.')

  try {
    const sock = getSock(sessionId)
    if (!sock) {
      return res.status(404).json({
        status: 'error',
        message: `Session '${sessionId}' tidak ditemukan atau tidak aktif.`,
      })
    }
    const result = await sock.sendMessage(phone + '@s.whatsapp.net', { text: message })
    return res.status(200).json({ status: 'success', result })
  } catch (err) {
    console.error('❌ Gagal kirim pesan:', err)
    return res.status(500).json({ status: 'error', message: err.message })
  }
}


const uploadExcel = async (req, res) => {
  const { sessionId } = req.params
  const messageTemplate = req.body.messageTemplate || ''
  const notifyNumber = req.body.notifyNumber?.replace(/\D/g, '')
  const selectTarget = req.body.selectTarget
  const inputNumbers = req.body.inputNumbers
  const filePath = req.file?.path // Gunakan optional chaining di sini

  // Validasi awal
  if (selectTarget !== 'input' && !filePath) {
    return res.status(400).json({ error: 'File tidak ditemukan. Silakan upload file Excel atau gunakan input manual.' })
  }

  // Langsung balas ke client
  res.json({ status: 'processing', message: 'Blast dimulai di background' })
  logger.info('🔄 Memproses blast...')

  // Proses jalan di background
  processExcelAndSendMessages(filePath, sessionId, messageTemplate, notifyNumber, req.user?.id, selectTarget, inputNumbers)
    .then(results => logger.info('✅ Blast selesai:', results.length, 'pesan diproses'))
    .catch(err => {
      if (err instanceof Error) {
        logger.error('❌ Error saat blast:', err.message)
      } else {
        logger.error('❌ Error saat blast (non-standard):', JSON.stringify(err))
      }
      logger.error('❌ Gagal saat blast:', err)
      logger.error('❌ Error stack:', err?.stack)
    })
}


const logoutSession = async (req, res) => {
    const { sessionId } = req.params
  
    try {
      const sock = getSock(sessionId)
  
      if (sock) {
        await sock.logout() // Jika masih aktif
        logger.info(`🔌 Logout session ${sessionId} berhasil.`)
      } else {
        logger.warn(`⚠️ Session ${sessionId} sudah tidak aktif atau undefined.`)
      }

      cleanupSession(sessionId,req.user?.id) // Hapus session dari memori
  
      return res.status(200).json({
        status: 'success',
        message: `Logout session ${sessionId} berhasil.`,
      })
    } catch (err) {
      console.error(`❌ Gagal logout session ${sessionId}:`, err.message)
      return res.status(500).json({
        status: 'error',
        message: err.message || 'Gagal logout session',
      })
    }
  }
  

  const getActiveSessions = async (req, res) => {
    try {
      const userId = req.user.id // pastikan middleware auth sudah pasang req.user
  
      const activeSessions = await SessionModel.findAll({
        where: { userId }, // filter hanya session milik user login
        include: [{
          model: UserModel,
          as: 'user',
          attributes: ['id', 'username', 'role'], // ambil kolom yang diperlukan dari User
        }],
      })
  
      return res.status(200).json({
        status: 'success',
        activeSessions,
      })
    } catch (error) {
      console.error('Error fetching sessions:', error)
      return res.status(500).json({
        status: 'error',
        message: 'Failed to get active sessions',
      })
    }
  }


module.exports = { 
  getQRImage,
  sendMessageWA,
  uploadExcel,
  logoutSession,
  getActiveSessions,
}
