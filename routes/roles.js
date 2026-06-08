const express = require('express');
const { body, validationResult } = require('express-validator');
const { Role, Category, Organization } = require('../models');
const { authenticateToken, invalidateAllUserCache } = require('../middleware/auth');
const { checkAccess } = require('../middleware/authorization');
const { writeLimiter } = require('../middleware/rateLimiter');
const logger = require('../utils/logger');

const router = express.Router();

// Разрешённые поля прав — isAdmin НИКОГДА не приходит из тела запроса
const ALLOWED_PERM_FIELDS = [
    'canViewMaterials', 'canDownloadMaterials', 'canCreateMaterials',
    'canEditMaterials', 'canDeleteMaterials', 'canCreateCategories',
    'canEditCategories', 'canDeleteCategories', 'canManageAllCategories',
    'canViewUsers', 'canCreateUsers', 'canEditUsers', 'canDeleteUsers',
    'canViewLogs', 'canManageRoles', 'canCreateArticles', 'canReadArticles',
    'canGenerateProReview', 'categoryAccessType'
];

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
// Доступно: управление ролями, просмотр/создание/редактирование пользователей (нужен список ролей для формы)
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { userIsAdmin, userHasPermission } = require('../middleware/authorization');
        const allowed = userIsAdmin(req) ||
            userHasPermission(req, 'canManageRoles') ||
            userHasPermission(req, 'canViewUsers') ||
            userHasPermission(req, 'canCreateUsers') ||
            userHasPermission(req, 'canEditUsers');

        if (!allowed) {
            return res.status(403).json({ success: false, message: 'Доступ запрещен' });
        }

        const { organizationId } = req.query;
        const whereClause = {};
        if (organizationId) {
            whereClause.organizationId = parseInt(organizationId);
        }

        const roles = await Role.findAll({
            where: whereClause,
            order: [['name', 'ASC']],
            include: [{
                model: Organization,
                as: 'organization',
                attributes: ['id', 'name'],
                required: false
            }]
        });
        res.json({ success: true, data: roles });
    } catch (error) {
        logger.error('Get roles error:', error);
        res.status(500).json({ success: false, message: 'Ошибка получения ролей' });
    }
});

// POST /api/roles - Создание новой роли
router.post('/', [writeLimiter, authenticateToken, checkAccess('canManageRoles'), ...roleValidation], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, message: 'Ошибки валидации', errors: errors.array() });
        }

        const { name, description, allowedCategories, organizationId } = req.body;
        const safePerms = Object.fromEntries(
            ALLOWED_PERM_FIELDS.filter(k => k in req.body).map(k => [k, req.body[k]])
        );

        const newRole = await Role.create({
            name,
            description,
            organizationId: organizationId ? parseInt(organizationId) : null,
            ...safePerms
        });

        if (allowedCategories && Array.isArray(allowedCategories)) {
            await newRole.setAllowedCategories(allowedCategories);
        }

        res.status(201).json({ success: true, message: 'Роль создана успешно', data: newRole });
    } catch (error) {
        logger.error('Create role error:', error);
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
        logger.error('Get role by id error:', error);
        res.status(500).json({ success: false, message: 'Ошибка получения роли' });
    }
});

// PUT /api/roles/:id - Обновление роли
router.put('/:id', [writeLimiter, authenticateToken, checkAccess('canManageRoles'), ...roleValidation], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, message: 'Ошибки валидации', errors: errors.array() });
        }

        const { id } = req.params;
        const { name, description, allowedCategories, organizationId } = req.body;
        const safePerms = Object.fromEntries(
            ALLOWED_PERM_FIELDS.filter(k => k in req.body).map(k => [k, req.body[k]])
        );

        const role = await Role.findByPk(id);
        if (!role) {
            return res.status(404).json({ success: false, message: 'Роль не найдена' });
        }

        await role.update({
            name,
            description,
            organizationId: organizationId !== undefined ? (organizationId ? parseInt(organizationId) : null) : role.organizationId,
            ...safePerms
        });

        if (allowedCategories && Array.isArray(allowedCategories)) {
            await role.setAllowedCategories(allowedCategories);
        }

        // Права роли изменились — сбрасываем кэш всех пользователей с этой ролью
        invalidateAllUserCache();

        res.json({ success: true, message: 'Роль обновлена успешно', data: role });
    } catch (error) {
        logger.error('Update role error:', error);
        res.status(500).json({ success: false, message: 'Ошибка обновления роли' });
    }
});

// DELETE /api/roles/:id - Удаление роли
router.delete('/:id', [writeLimiter, authenticateToken, checkAccess('canManageRoles')], async (req, res) => {
    try {
        const { id } = req.params;

        const role = await Role.findByPk(id);
        if (!role) {
            return res.status(404).json({ success: false, message: 'Роль не найдена' });
        }

        const userCount = await role.countUsers();
        if (userCount > 0) {
            return res.status(400).json({
                success: false,
                message: `Нельзя удалить роль: к ней привязано ${userCount} пользователей`
            });
        }

        await role.destroy();

        res.json({ success: true, message: 'Роль удалена успешно' });
    } catch (error) {
        logger.error('Delete role error:', error);
        res.status(500).json({ success: false, message: 'Ошибка удаления роли' });
    }
});

module.exports = router;