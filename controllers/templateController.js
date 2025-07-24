const Template = require('../models/templateModel');
const { Op } = require('sequelize');
const logger = require('../utils/logger');
const { asyncHandler, AppError } = require('../middleware/errorHandler');

const getTemplates = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const templates = await Template.findAll({
        where: { userId },
        order: [['createdAt', 'DESC']],
    });
    res.status(200).json(templates);
});

const createTemplate = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { name, content, type } = req.body;

    if (!name || !content) {
        throw new AppError('Name and content are required', 400);
    }

    const newTemplate = await Template.create({
        userId,
        name,
        content,
        type: type || 'text', // Default to 'text' if not provided
    });

    res.status(201).json(newTemplate);
})

const updateTemplate = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { id, name, content, type } = req.body;

    if (!id || !name || !content) {
        throw new AppError('ID, name, and content are required', 400);
    }

    const template = await Template.findOne({
        where: {
            id,
            userId
        }
    });

    if (!template) {
        throw new AppError('Template not found', 404);
    }

    template.name = name;
    template.content = content;
    template.type = type || 'text'; // Default to 'text' if not provided
    await template.save();

    res.status(200).json(template);
})
const deleteTemplate = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { id } = req.body;

    if (!id) {
        throw new AppError('ID is required', 400);
    }

    const template = await Template.findOne({
        where: {
            id,
            userId
        }
    });

    if (!template) {
        throw new AppError('Template not found', 404);
    }

    await template.destroy();
    res.status(200).json({ message: 'Template deleted successfully' });
})

module.exports = {
    getTemplates,
    createTemplate,
    updateTemplate,
    deleteTemplate
}