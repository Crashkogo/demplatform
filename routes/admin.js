const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Material = require('../models/Material');
const Category = require('../models/Category');
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
    body('role')
        .isIn(['admin', 'client'])
        .withMessage('Роль должна быть admin или client')
];

// GET /api/admin/stats - Получение статистики
router.get('/stats', [authenticateToken, requireAdmin], async (req, res) => {
    try {
        // Статистика пользователей
        const totalUsers = await User.countDocuments();
        const adminUsers = await User.countDocuments({ role: 'admin' });
        const clientUsers = await User.countDocuments({ role: 'client' });

        // Статистика категорий
        const totalCategories = await Category.countDocuments({ isActive: true });
        const rootCategories = await Category.countDocuments({ parentId: null, isActive: true });

        // Статистика материалов
        const totalMaterials = await Material.countDocuments({ isActive: true });
        const materialsByType = await Material.aggregate([
            { $match: { isActive: true } },
            { $group: { _id: '$fileType', count: { $sum: 1 } } }
        ]);

        // Популярные материалы - упрощаем запрос
        const popularMaterials = await Material.find({ isActive: true })
            .sort({ viewCount: -1 })
            .limit(5)
            .populate('categoryId', 'name')
            .select('title viewCount downloadCount categoryId')
            .lean();

        // Недавно загруженные материалы - упрощаем запрос  
        const recentMaterials = await Material.find({ isActive: true })
            .sort({ createdAt: -1 })
            .limit(5)
            .populate('categoryId', 'name')
            .populate('uploadedBy', 'login')
            .select('title createdAt categoryId uploadedBy fileType')
            .lean();

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
                    acc[item._id] = item.count;
                    return acc;
                }, {}),
                popular: popularMaterials || [],
                recent: recentMaterials || []
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

        let query = {};
        if (search) {
            query.login = new RegExp(search, 'i');
        }

        const users = await User.find(query)
            .select('-password')
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit));

        const total = await User.countDocuments(query);

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

        const { login, password, role } = req.body;

        // Проверяем, существует ли пользователь с таким логином
        const existingUser = await User.findOne({ login });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'Пользователь с таким логином уже существует'
            });
        }

        const user = new User({
            login,
            password,
            role
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
        const { login, role, password } = req.body;

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Пользователь не найден'
            });
        }

        // Проверяем логин на уникальность (если он изменяется)
        if (login && login !== user.login) {
            const existingUser = await User.findOne({ login });
            if (existingUser) {
                return res.status(400).json({
                    success: false,
                    message: 'Пользователь с таким логином уже существует'
                });
            }
            user.login = login;
        }

        if (role && ['admin', 'client'].includes(role)) {
            user.role = role;
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

        const user = await User.findById(id);
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

        let query = { isActive: true };

        if (search) {
            query.$or = [
                { title: new RegExp(search, 'i') },
                { description: new RegExp(search, 'i') }
            ];
        }

        if (categoryId) {
            query.categoryId = categoryId;
        }

        if (fileType) {
            query.fileType = fileType;
        }

        const materials = await Material.find(query)
            .populate('categoryId', 'name')
            .populate('uploadedBy', 'login')
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit));

        const total = await Material.countDocuments(query);

        res.json({
            success: true,
            data: materials,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                hasMore: total > parseInt(page) * parseInt(limit)
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

module.exports = router;