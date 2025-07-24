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
const { asyncHandler, AppError } = require('../middleware/errorHandler')

const getQRImage = asyncHandler(async (req, res) => {
  const { sessionId } = req.params

  if (!getSock(sessionId)) {
    await startWhatsApp(sessionId,req.user?.id) // QR akan otomatis ter-generate
  }

  const qrData = await waitForQRCode(sessionId)
  if (qrData) {
    const base64 = qrData.replace(/^data:image\/png;base64,/, '')
    return res.status(200).json({
      status: 'success',
      qrCode: base64, // Mengembalikan QR code dalam bentuk base64
    });
  } else {
    throw new AppError('QR belum tersedia', 404)
  }
})


const sendMessageWA = asyncHandler(async (req, res) => {
  const { phone, message, sessionId } = req.body
  logger.info(`📞 Mengirim pesan ke: ${phone}, dengan pesan: ${message}, pada session: ${sessionId}`)
  
  if (!phone || !message || !sessionId) {
    throw new AppError('Nomor, pesan, dan sessionId wajib.', 400)
  }

  const sock = getSock(sessionId)
  if (!sock) {
    throw new AppError(`Session '${sessionId}' tidak ditemukan atau tidak aktif.`, 404)
  }
  
  const result = await sock.sendMessage(phone + '@s.whatsapp.net', { text: message })
  return res.status(200).json({ status: 'success', result })
})


const uploadExcel = asyncHandler(async (req, res) => {
  const { sessionId } = req.params
  const messageTemplate = req.body.messageTemplate || ''
  const notifyNumber = req.body.notifyNumber?.replace(/\D/g, '')
  const selectTarget = req.body.selectTarget
  const inputNumbers = req.body.inputNumbers
  const filePath = req.file?.path // Gunakan optional chaining di sini

  // Validasi awal
  if (selectTarget !== 'input' && !filePath) {
    throw new AppError('File tidak ditemukan. Silakan upload file Excel atau gunakan input manual.', 400)
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
})


const logoutSession = asyncHandler(async (req, res) => {
    const { sessionId } = req.params
  
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
})
  

const getActiveSessions = asyncHandler(async (req, res) => {
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
})


module.exports = { 
  getQRImage,
  sendMessageWA,
  uploadExcel,
  logoutSession,
  getActiveSessions,
}
