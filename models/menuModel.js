// /api/models/menuItem.model.js
const { DataTypes } = require('sequelize')
const sequelize = require('./db')

const MenuItem = sequelize.define('MenuItem', {
    label: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    path: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    icon: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    component: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    role: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        allowNull: false,
        defaultValue: [],
    },
    active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
    },
    }, {
    timestamps: true,
    })

module.exports = MenuItem
