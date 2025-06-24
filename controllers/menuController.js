const MenuItem = require('../models/menuModel')
const { Op } = require('sequelize')

const getMenu = async (req, res) => {
    try {
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
    } catch (error) {
      console.error('Error getting menu:', error)
      res.status(500).json({ message: 'Failed to get menu items', error })
    }
}

const createMenu = async (req, res) => {
    try {
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
    } catch (error) {
      console.error('Error creating menu item:', error)
      res.status(500).json({ message: 'Failed to create menu item', error })
    }
  }

  const updateMenu = async (req, res) => {
    try {
      const { id } = req.params
      const { label, path, icon, component, role, active } = req.body
  
      const menuItem = await MenuItem.findByPk(id)
  
      if (!menuItem) {
        return res.status(404).json({ message: 'Menu item not found' })
      }
  
      menuItem.label = label || menuItem.label
      menuItem.path = path || menuItem.path
      menuItem.icon = icon || menuItem.icon
      menuItem.component = component || menuItem.component
      menuItem.active = active !== undefined ? active : menuItem.active
      menuItem.role = role || menuItem.role
  
      await menuItem.save()
  
      res.status(200).json(menuItem)
    } catch (error) {
      console.error('Error updating menu item:', error)
      res.status(500).json({ message: 'Failed to update menu item', error })
    }
  }

module.exports = { getMenu, createMenu, updateMenu }
