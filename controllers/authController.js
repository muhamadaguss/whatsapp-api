// /controllers/auth.controller.js
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const UserModel = require('../models/userModel')
const BlacklistedToken = require('../models/blacklistedTokenModel')

const login = async (req, res) => {
  const { username, password } = req.body
  try {
    const user = await UserModel.findOne({
      where: { username }
    })
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ message: 'Invalid credentials' })
    }

    if(!user.isActive) {
      return res.status(401).json({ message: 'User is inactive' })
    }
    
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, process.env.JWT_SECRET, { expiresIn: '12h' })
    res.json({ token })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const register = async (req, res) => {
  const { username, password, role } = req.body

  if (!username || !password || !role) {
    return res.status(400).json({
      error: 'Username, password, and role are required fields.'
    });
  }

  
  try {
    const hashed = bcrypt.hashSync(password, 10)
    const user = await UserModel.create({ username, password: hashed, role })
    res.status(201).json(user)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const verify = (req, res) => {
  res.json({ valid: true, user: req.user })
}

const hashPassword = async (req, res) => {
  const { password } = req.body

  if (!password) {
    return res.status(400).json({ message: 'Password is required' })
  }

  try {
    const salt = await bcrypt.genSalt(10)
    const hashedPassword = await bcrypt.hash(password, salt)

    return res.status(200).json({ hashedPassword })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}

const logout = async (req, res) => {
  const authHeader = req.headers.authorization
  const token = authHeader && authHeader.split(' ')[1]

  if (!token) {
    return res.status(400).json({ message: 'No token provided' })
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    
    // Tambahkan ke blacklist
    await BlacklistedToken.create({
      token,
      expiresAt: new Date(decoded.exp * 1000),
    })

    return res.status(200).json({ message: 'Logout successful, token blacklisted' })
  } catch (err) {
    // Jika token expired, tetap masukkan ke blacklist
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

module.exports = {
  login,
  register,
  verify,
  hashPassword,
  logout,
}
