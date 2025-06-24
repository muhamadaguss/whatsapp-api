const UserModel = require('../models/userModel')

const getUsers = async (req, res) => {
    try {
        const users = await UserModel.findAll()
        res.json(users)
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
}

const updateActive = async (req, res) => {
    try {
        const { id } = req.params
        const user = await UserModel.findByPk(id)
        if (!user) {
            return res.status(404).json({ error: 'User not found' })
        }
        user.isActive = !user.isActive
        await user.save()
        res.json(user)
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
}
module.exports = {
    getUsers,
    updateActive
}