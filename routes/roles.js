const express = require('express');
const { body, validationResult } = require('express-validator');
const { Role, Category } = require('../models');
const { authenticateToken } = require('../middleware/auth');
const { checkAccess } = require('../middleware/authorization');

const router = express.Router();

// Валидаторы для ролей
const roleValidation = [
    body('name')
        .isLength({ min: 1, max: 100 })
        .withMessage('Название роли должно содержать от 1 до 100 символов')
        .trim(),
    body('description')
        .optional()
        .isLength({ max: 1000 })
        .withMessage('Описание не может превышать 1000 символов')
        .trim(),
];

// GET /api/roles - Получение списка всех ролей
router.get('/', authenticateToken, async (req, res) => {
    try {
        const roles = await Role.findAll({
            order: [['name', 'ASC']]
        });
        res.json({ success: true, data: roles });
    } catch (error) {
        console.error('Get roles error:', error);
        res.status(500).json({ success: false, message: 'Ошибка получения ролей' });
    }
});

// POST /api/roles - Создание новой роли
router.post('/', [authenticateToken, checkAccess('canManageRoles'), ...roleValidation], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, message: 'Ошибки валидации', errors: errors.array() });
        }

        const { name, description, allowedCategories, ...permissions } = req.body;

        const newRole = await Role.create({
            name,
            description,
            ...permissions
        });

        if (allowedCategories && Array.isArray(allowedCategories)) {
            await newRole.setAllowedCategories(allowedCategories);
        }

        res.status(201).json({ success: true, message: 'Роль создана успешно', data: newRole });
    } catch (error) {
        console.error('Create role error:', error);
        res.status(500).json({ success: false, message: 'Ошибка создания роли' });
    }
});

// GET /api/roles/:id - Получение роли по ID
router.get('/:id', [authenticateToken, checkAccess('canManageRoles')], async (req, res) => {
    try {
        const { id } = req.params;
        const role = await Role.findByPk(id, {
            include: 'allowedCategories'
        });

        if (!role) {
            return res.status(404).json({ success: false, message: 'Роль не найдена' });
        }

        res.json({ success: true, data: role });
    } catch (error) {
        console.error('Get role by id error:', error);
        res.status(500).json({ success: false, message: 'Ошибка получения роли' });
    }
});

// PUT /api/roles/:id - Обновление роли
router.put('/:id', [authenticateToken, checkAccess('canManageRoles'), ...roleValidation], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, message: 'Ошибки валидации', errors: errors.array() });
        }

        const { id } = req.params;
        const { name, description, allowedCategories, ...permissions } = req.body;

        const role = await Role.findByPk(id);
        if (!role) {
            return res.status(404).json({ success: false, message: 'Роль не найдена' });
        }

        await role.update({
            name,
            description,
            ...permissions
        });

        if (allowedCategories && Array.isArray(allowedCategories)) {
            await role.setAllowedCategories(allowedCategories);
        }

        res.json({ success: true, message: 'Роль обновлена успешно', data: role });
    } catch (error) {
        console.error('Update role error:', error);
        res.status(500).json({ success: false, message: 'Ошибка обновления роли' });
    }
});

// DELETE /api/roles/:id - Удаление роли
router.delete('/:id', [authenticateToken, checkAccess('canManageRoles')], async (req, res) => {
    try {
        const { id } = req.params;

        const role = await Role.findByPk(id);
        if (!role) {
            return res.status(404).json({ success: false, message: 'Роль не найдена' });
        }

        // TODO: Проверить, что роль не используется пользователями
        
        await role.destroy();

        res.json({ success: true, message: 'Роль удалена успешно' });
    } catch (error) {
        console.error('Delete role error:', error);
        res.status(500).json({ success: false, message: 'Ошибка удаления роли' });
    }
});

module.exports = router;