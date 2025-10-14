const express = require('express');
const { body, validationResult } = require('express-validator');
const { User, Material, Category, sequelize, AuditEvent } = require('../models');
const { Op } = require('sequelize');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Валидаторы для создания пользователя
const userValidation = [
    body('login')
        .isLength({ min: 3, max: 50 })
        .withMessage('Логин должен содержать от 3 до 50 символов')
        .trim(),
    body('password')
        .isLength({ min: 6 })
        .withMessage('Пароль должен содержать минимум 6 символов'),
    body('roleId')
        .isInt({ min: 1 })
        .withMessage('Необходимо указать корректную роль')
];

// GET /api/admin/stats - Получение статистики
router.get('/stats', [authenticateToken, requireAdmin], async (req, res) => {
    try {
        // Статистика пользователей
        const { Role } = require('../models');
        const totalUsers = await User.count();

        // Подсчитываем администраторов через роли
        const adminRole = await Role.findOne({ where: { isAdmin: true } });
        const adminUsers = adminRole ? await User.count({ where: { roleId: adminRole.id } }) : 0;
        const clientUsers = totalUsers - adminUsers;

        // Статистика категорий
        const totalCategories = await Category.count({ where: { isActive: true } });
        const rootCategories = await Category.count({ where: { parentId: null, isActive: true } });

        // Статистика материалов
        const totalMaterials = await Material.count({ where: { isActive: true } });
        const materialsByType = await Material.findAll({
            where: { isActive: true },
            attributes: [
                'fileType',
                [sequelize.fn('COUNT', sequelize.col('fileType')), 'count']
            ],
            group: ['fileType']
        });

        // Популярные материалы
        const popularMaterials = await Material.findAll({
            where: { isActive: true },
            attributes: ['id', 'title', 'viewCount', 'downloadCount', 'categoryId'],
            include: [
                {
                    model: Category,
                    as: 'category',
                    attributes: ['id', 'name']
                }
            ],
            order: [['viewCount', 'DESC']],
            limit: 5
        });

        // Недавно загруженные материалы
        const recentMaterials = await Material.findAll({
            where: { isActive: true },
            attributes: ['id', 'title', 'createdAt', 'categoryId', 'uploadedBy', 'fileType'],
            include: [
                {
                    model: Category,
                    as: 'category',
                    attributes: ['id', 'name']
                },
                {
                    model: User,
                    as: 'uploader',
                    attributes: ['id', 'login']
                }
            ],
            order: [['createdAt', 'DESC']],
            limit: 5
        });

        const stats = {
            users: {
                total: totalUsers,
                admins: adminUsers,
                clients: clientUsers
            },
            categories: {
                total: totalCategories,
                root: rootCategories
            },
            materials: {
                total: totalMaterials,
                byType: materialsByType.reduce((acc, item) => {
                    acc[item.fileType] = parseInt(item.dataValues.count);
                    return acc;
                }, {}),
                popular: popularMaterials.map(m => m.toJSON()),
                recent: recentMaterials.map(m => m.toJSON())
            }
        };

        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('Get admin stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения статистики',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// GET /api/admin/users - Получение списка пользователей
router.get('/users', [authenticateToken, requireAdmin], async (req, res) => {
    try {
        const { page = 1, limit = 20, search } = req.query;

        const whereClause = {};
        if (search) {
            whereClause.login = {
                [sequelize.Sequelize.Op.iLike]: `%${search}%`
            };
        }

        const { Role } = require('../models');
        const { rows: users, count: total } = await User.findAndCountAll({
            where: whereClause,
            attributes: { exclude: ['password'] },
            include: [{
                model: Role,
                as: 'roleData',
                attributes: ['id', 'name', 'isAdmin']
            }],
            order: [['createdAt', 'DESC']],
            limit: parseInt(limit),
            offset: (parseInt(page) - 1) * parseInt(limit)
        });

        res.json({
            success: true,
            data: users,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                hasMore: total > parseInt(page) * parseInt(limit)
            }
        });
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения пользователей'
        });
    }
});

// POST /api/admin/users - Создание нового пользователя
router.post('/users', [authenticateToken, requireAdmin, ...userValidation], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Ошибки валидации',
                errors: errors.array()
            });
        }

        const { login, password, roleId } = req.body;

        if (!roleId) {
            return res.status(400).json({
                success: false,
                message: 'Необходимо указать роль'
            });
        }

        // Проверяем, существует ли пользователь с таким логином
        const existingUser = await User.findOne({ where: { login } });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'Пользователь с таким логином уже существует'
            });
        }

        const user = new User({
            login,
            password,
            roleId
        });

        await user.save();

        res.status(201).json({
            success: true,
            message: 'Пользователь создан успешно',
            data: user.toSafeObject()
        });
    } catch (error) {
        console.error('Create user error:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка создания пользователя'
        });
    }
});

// PUT /api/admin/users/:id - Обновление пользователя
router.put('/users/:id', [authenticateToken, requireAdmin], async (req, res) => {
    try {
        const { id } = req.params;
        const { login, roleId, password } = req.body;

        const user = await User.findByPk(id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Пользователь не найден'
            });
        }

        // Проверяем логин на уникальность (если он изменяется)
        if (login && login !== user.login) {
            const existingUser = await User.findOne({ where: { login } });
            if (existingUser) {
                return res.status(400).json({
                    success: false,
                    message: 'Пользователь с таким логином уже существует'
                });
            }
            user.login = login;
        }

        // Обновляем роль
        if (roleId !== undefined) {
            user.roleId = roleId;
        }

        if (password && password.length >= 6) {
            user.password = password;
        }

        await user.save();

        res.json({
            success: true,
            message: 'Пользователь обновлен успешно',
            data: user.toSafeObject()
        });
    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка обновления пользователя'
        });
    }
});

// DELETE /api/admin/users/:id - Удаление пользователя
router.delete('/users/:id', [authenticateToken, requireAdmin], async (req, res) => {
    try {
        const { id } = req.params;

        // Нельзя удалить самого себя
        if (id === req.user._id.toString()) {
            return res.status(400).json({
                success: false,
                message: 'Нельзя удалить самого себя'
            });
        }

        const user = await User.findByPk(id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Пользователь не найден'
            });
        }

        await User.findByIdAndDelete(id);

        res.json({
            success: true,
            message: 'Пользователь удален успешно'
        });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка удаления пользователя'
        });
    }
});

// GET /api/admin/materials - Получение списка материалов для админки
router.get('/materials', [authenticateToken, requireAdmin], async (req, res) => {
    try {
        const { page = 1, limit = 20, search, categoryId, fileType } = req.query;

        const options = {
            categoryId,
            fileType,
            limit: parseInt(limit),
            skip: (parseInt(page) - 1) * parseInt(limit)
        };

        // Используем оптимизированный метод поиска из модели
        const result = await Material.search(search, options);

        res.json({
            success: true,
            data: result.materials,
            pagination: {
                total: result.total,
                page: parseInt(page),
                limit: parseInt(limit),
                hasMore: result.hasMore
            }
        });
    } catch (error) {
        console.error('Get admin materials error:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения материалов'
        });
    }
});

// GET /api/admin/logs - Получение истории действий
router.get('/logs', [authenticateToken, requireAdmin], async (req, res) => {
    try {
        const { page = 1, limit = 15, dateFrom, dateTo, eventType, userId } = req.query;

        const whereClause = {};

        if (userId) {
            whereClause.userId = userId;
        }
        if (eventType) {
            whereClause.eventType = eventType;
        }
        // Применяем фильтр по дате, только если даты не пустые
        if (dateFrom && dateTo) {
            whereClause.createdAt = { [Op.between]: [new Date(dateFrom), new Date(dateTo)] };
        } else if (dateFrom) {
            whereClause.createdAt = { [Op.gte]: new Date(dateFrom) };
        } else if (dateTo) {
            whereClause.createdAt = { [Op.lte]: new Date(dateTo) };
        }

        const { rows, count } = await AuditEvent.findAndCountAll({
            where: whereClause,
            include: [{
                model: User,
                attributes: ['id', 'login']
            }],
            order: [['createdAt', 'DESC']],
            limit: parseInt(limit),
            offset: (parseInt(page) - 1) * parseInt(limit)
        });

        res.json({
            success: true,
            data: { rows, count }
        });

    } catch (error) {
        console.error('Get audit logs error:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения истории действий'
        });
    }
});

module.exports = router;