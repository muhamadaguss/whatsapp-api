const UserModel = require('../models/userModel')
const { asyncHandler, AppError } = require('../middleware/errorHandler')
const getUsers = asyncHandler(async (req, res) => {
    const users = await UserModel.findAll()
    res.json(users)
})
const updateActive = asyncHandler(async (req, res) => {
    const { id } = req.params
    const user = await UserModel.findByPk(id)
    if (!user) {
        throw new AppError('User not found', 404)
    }
    user.isActive = !user.isActive
    await user.save()
    res.json(user)
})
module.exports = {
    getUsers,
    updateActive
}
