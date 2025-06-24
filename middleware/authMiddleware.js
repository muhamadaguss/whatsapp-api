// /api/middleware/auth.middleware.js
const jwt = require('jsonwebtoken')
const { loadExistingSessions } = require('../auth/session')
const BlacklistedToken = require('../models/blacklistedTokenModel')

const verifyToken = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ message: 'No token provided' })

  try {
    // Cek apakah token sudah di-blacklist
    const blacklisted = await BlacklistedToken.findOne({ where: { token } })
    if (blacklisted) return res.status(401).json({ message: 'Token has been blacklisted' })

    // Verifikasi token
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    req.user = decoded // Load session untuk user yang terverifikasi
    next() // Load session untuk user yang terverifikasi
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      try {
        const decoded = jwt.decode(token) // decode tanpa verifikasi
        await BlacklistedToken.create({
          token,
          expiresAt: new Date(decoded.exp * 1000),
        })
        return res.status(200).json({ message: 'Token expired, but blacklisted for safety' })
      } catch (decodeErr) {
        return res.status(400).json({ message: 'Token expired and invalid format' })
      }
    }
    return res.status(401).json({ message: 'Invalid token' })
  }
}

module.exports = { verifyToken }
