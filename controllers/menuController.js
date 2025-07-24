const MenuItem = require('../models/menuModel')
const { Op } = require('sequelize')
const logger = require('../utils/logger')
const { asyncHandler, AppError } = require('../middleware/errorHandler')

const getMenu = asyncHandler(async (req, res) => {
    const role = req.user.role

    // let whereClause = {
    //   active: true, // Hanya ambil yang active true
    // }

    if (role) {
      // Menampilkan menu yang role-nya mengandung role yang diberikan
      whereClause = {
        // ...whereClause,
        role: {
          [Op.contains]: [role], // PostgreSQL-specific operator
        },
      }
    }

    const menus = await MenuItem.findAll({
      where: whereClause,
      order: [['id', 'ASC']],
    })

    res.status(200).json(menus)
})

const createMenu = asyncHandler(async (req, res) => {
    const { label, path, icon, component, role, active } = req.body

    const newMenu = await MenuItem.create({
      label,
      path,
      icon,
      component,
      active,
      role: role || [], // Default to empty array if no role provided
    })

    res.status(200).json(newMenu)
})

const updateMenu = asyncHandler(async (req, res) => {
    const { id } = req.params
    const { label, path, icon, component, role, active } = req.body

    const menuItem = await MenuItem.findByPk(id)

    if (!menuItem) {
      throw new AppError('Menu item not found', 404)
    }

    menuItem.label = label || menuItem.label
    menuItem.path = path || menuItem.path
    menuItem.icon = icon || menuItem.icon
    menuItem.component = component || menuItem.component
    menuItem.active = active !== undefined ? active : menuItem.active
    menuItem.role = role || menuItem.role

    await menuItem.save()

    res.status(200).json(menuItem)
})

module.exports = { getMenu, createMenu, updateMenu }
