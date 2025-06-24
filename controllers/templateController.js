const Template = require('../models/templateModel');
const { Op } = require('sequelize');

const getTemplates = async (req, res) => {
    try {
        const userId = req.user.id;
        const templates = await Template.findAll({
            where: { userId },
            order: [['createdAt', 'DESC']],
        });
        res.status(200).json(templates);
    } catch (error) {
        console.error('Error getting templates:', error);
        res.status(500).json({ message: 'Failed to get templates', error });
    }
};

const createTemplate = async (req, res) => {
    try {
        const userId = req.user.id;
        const { name, content, type } = req.body;

        if (!name || !content) {
            return res.status(400).json({ message: 'Name and content are required' });
        }

        const newTemplate = await Template.create({
            userId,
            name,
            content,
            type: type || 'text', // Default to 'text' if not provided
        });

        res.status(201).json(newTemplate);
    } catch (error) {
        console.error('Error creating template:', error);
        res.status(500).json({ message: 'Failed to create template', error });
    }
}

const updateTemplate = async (req, res) => {
    try {
        const userId = req.user.id;
        const { id, name, content, type } = req.body;

        if (!id || !name || !content) {
            return res.status(400).json({ message: 'ID, name, and content are required' });
        }

        const template = await Template.findOne({
            where: {
                id,
                userId
            }
        });

        if (!template) {
            return res.status(404).json({ message: 'Template not found' });
        }

        template.name = name;
        template.content = content;
        template.type = type || 'text'; // Default to 'text' if not provided
        await template.save();

        res.status(200).json(template);
    } catch (error) {
        console.error('Error updating template:', error);
        res.status(500).json({ message: 'Failed to update template', error });
    }
}
const deleteTemplate = async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.body;

        if (!id) {
            return res.status(400).json({ message: 'ID is required' });
        }

        const template = await Template.findOne({
            where: {
                id,
                userId
            }
        });

        if (!template) {
            return res.status(404).json({ message: 'Template not found' });
        }

        await template.destroy();
        res.status(200).json({ message: 'Template deleted successfully' });
    } catch (error) {
        console.error('Error deleting template:', error);
        res.status(500).json({ message: 'Failed to delete template', error });
    }
}

module.exports = {
    getTemplates,
    createTemplate,
    updateTemplate,
    deleteTemplate
}