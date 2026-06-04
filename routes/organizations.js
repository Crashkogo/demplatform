// routes/organizations.js
const express = require('express');
const { body, validationResult } = require('express-validator');
const { Organization, User, Role } = require('../models');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/rateLimiter');
const logger = require('../utils/logger');

const router = express.Router();

const orgValidation = [
    body('name')
        .isLength({ min: 1, max: 100 })
        .withMessage('Название должно содержать от 1 до 100 символов')
        .trim(),
    body('description')
        .optional()
        .isLength({ max: 1000 })
        .withMessage('Описание не может превышать 1000 символов')
        .trim()
];

// GET /api/organizations — список (любой авторизованный, нужен для дропдаунов)
router.get('/', authenticateToken, async (req, res) => {
    try {
        const orgs = await Organization.findAll({ order: [['name', 'ASC']] });
        res.json({ success: true, data: orgs });
    } catch (error) {
        logger.error('Get organizations error:', error);
        res.status(500).json({ success: false, message: 'Ошибка получения организаций' });
    }
});

// POST /api/organizations — создать (только isAdmin)
router.post('/', [writeLimiter, authenticateToken, requireAdmin, ...orgValidation], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, message: 'Ошибки валидации', errors: errors.array() });
        }

        const { name, description } = req.body;

        const existing = await Organization.findOne({ where: { name } });
        if (existing) {
            return res.status(400).json({ success: false, message: 'Организация с таким названием уже существует' });
        }

        const org = await Organization.create({ name, description });
        res.status(201).json({ success: true, message: 'Организация создана', data: org });
    } catch (error) {
        if (error.name === 'SequelizeUniqueConstraintError') {
            return res.status(400).json({ success: false, message: 'Организация с таким названием уже существует' });
        }
        logger.error('Create organization error:', error);
        res.status(500).json({ success: false, message: 'Ошибка создания организации' });
    }
});

// PUT /api/organizations/:id — изменить (только isAdmin)
router.put('/:id', [writeLimiter, authenticateToken, requireAdmin, ...orgValidation], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, message: 'Ошибки валидации', errors: errors.array() });
        }

        const { id } = req.params;
        const { name, description } = req.body;

        const org = await Organization.findByPk(id);
        if (!org) {
            return res.status(404).json({ success: false, message: 'Организация не найдена' });
        }

        if (name && name !== org.name) {
            const existing = await Organization.findOne({ where: { name } });
            if (existing) {
                return res.status(400).json({ success: false, message: 'Организация с таким названием уже существует' });
            }
        }

        await org.update({ name, description });
        res.json({ success: true, message: 'Организация обновлена', data: org });
    } catch (error) {
        logger.error('Update organization error:', error);
        res.status(500).json({ success: false, message: 'Ошибка обновления организации' });
    }
});

// DELETE /api/organizations/:id — удалить (только isAdmin)
router.delete('/:id', [writeLimiter, authenticateToken, requireAdmin], async (req, res) => {
    try {
        const { id } = req.params;

        const org = await Organization.findByPk(id);
        if (!org) {
            return res.status(404).json({ success: false, message: 'Организация не найдена' });
        }

        const userCount = await User.count({ where: { organizationId: id } });
        const roleCount = await Role.count({ where: { organizationId: id } });

        if (userCount > 0 || roleCount > 0) {
            return res.status(400).json({
                success: false,
                message: 'Нельзя удалить организацию: существуют привязанные пользователи или роли. Сначала переназначьте их.'
            });
        }

        await org.destroy();
        res.json({ success: true, message: 'Организация удалена' });
    } catch (error) {
        logger.error('Delete organization error:', error);
        res.status(500).json({ success: false, message: 'Ошибка удаления организации' });
    }
});

module.exports = router;
