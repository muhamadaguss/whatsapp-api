const { DataTypes } = require('sequelize')
const sequelize = require('./db')

const BlacklistedToken = sequelize.define('BlacklistedToken', {
  token: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: false
  }
}, { timestamps: true })

module.exports = BlacklistedToken
