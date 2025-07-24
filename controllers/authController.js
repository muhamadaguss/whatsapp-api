// /controllers/auth.controller.js
const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const bcrypt = require('bcryptjs')
const UserModel = require('../models/userModel')
const BlacklistedToken = require('../models/blacklistedTokenModel')
const { asyncHandler, AppError } = require('../middleware/errorHandler')
const logger = require('../utils/logger')

const login = asyncHandler(async (req, res) => {
  const { username, password } = req.body
  
  const user = await UserModel.findOne({
    where: { username }
  })
  
  if (!user || !bcrypt.compareSync(password, user.password)) {
    throw new AppError('Invalid credentials', 401)
  }

  if(!user.isActive) {
    throw new AppError('User is inactive', 401)
  }
  
  // Enhanced JWT generation with security claims
  const tokenPayload = {
    id: user.id,
    username: user.username,
    role: user.role,
    iat: Math.floor(Date.now() / 1000),
    jti: crypto.randomBytes(16).toString('hex'), // JWT ID for tracking
    iss: 'whatsapp-blast-api', // Issuer
    aud: 'whatsapp-blast-client' // Audience
  };

  const tokenOptions = {
    expiresIn: process.env.JWT_EXPIRES_IN || '12h',
    algorithm: 'HS256',
    issuer: 'whatsapp-blast-api',
    audience: 'whatsapp-blast-client'
  };

  const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, tokenOptions);
  
  // Log successful login
  logger.info({
    userId: user.id,
    username: user.username,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  }, 'User logged in successfully');

  res.json({ 
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role
    },
    expiresIn: tokenOptions.expiresIn
  })
})

const register = asyncHandler(async (req, res) => {
  const { username, password, role } = req.body

  if (!username || !password || !role) {
    throw new AppError('Username, password, and role are required fields.', 400)
  }

  const hashed = bcrypt.hashSync(password, 10)
  const user = await UserModel.create({ username, password: hashed, role })
  res.status(201).json(user)
})

const verify = (req, res) => {
  res.json({ valid: true, user: req.user })
}

const hashPassword = asyncHandler(async (req, res) => {
  const { password } = req.body

  if (!password) {
    throw new AppError('Password is required', 400)
  }

  const salt = await bcrypt.genSalt(10)
  const hashedPassword = await bcrypt.hash(password, salt)

  return res.status(200).json({ hashedPassword })
})

const logout = asyncHandler(async (req, res) => {
  const authHeader = req.headers.authorization
  const token = authHeader && authHeader.split(' ')[1]

  if (!token) {
    throw new AppError('No token provided', 400)
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    
    // Hash token before storing in blacklist for security
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    
    // Add to blacklist
    await BlacklistedToken.create({
      token: tokenHash,
      expiresAt: new Date(decoded.exp * 1000),
    })

    // Log successful logout
    logger.info({
      userId: decoded.id,
      username: decoded.username,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    }, 'User logged out successfully')

    return res.status(200).json({ 
      status: 'success',
      message: 'Logout successful, token blacklisted' 
    })
  } catch (err) {
    // If token expired, still add to blacklist for safety
    if (err.name === 'TokenExpiredError') {
      try {
        const decoded = jwt.decode(token, { complete: true })
        if (decoded && decoded.payload) {
          const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
          await BlacklistedToken.create({
            token: tokenHash,
            expiresAt: new Date(decoded.payload.exp * 1000),
          })
          
          logger.info({
            userId: decoded.payload.id,
            ip: req.ip
          }, 'Expired token blacklisted during logout')
        }
        return res.status(200).json({ 
          status: 'success',
          message: 'Token expired, but blacklisted for safety' 
        })
      } catch (decodeErr) {
        logger.error('Error decoding token during logout:', decodeErr)
        throw new AppError('Token expired and invalid format', 400)
      }
    }

    logger.warn({
      ip: req.ip,
      error: err.message
    }, 'Invalid token during logout')
    throw new AppError('Invalid token', 401)
  }
})

module.exports = {
  login,
  register,
  verify,
  hashPassword,
  logout,
}
