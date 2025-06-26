const express = require('express');
const { body, validationResult } = require('express-validator');
const Category = require('../models/Category');
const Material = require('../models/Material');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Валидаторы
const categoryValidation = [
    body('name')
        .isLength({ min: 1, max: 100 })
        .withMessage('Название категории должно содержать от 1 до 100 символов')
        .trim(),
    body('description')
        .optional()
        .isLength({ max: 500 })
        .withMessage('Описание не может превышать 500 символов')
        .trim(),
    body('parentId')
        .optional()
        .isMongoId()
        .withMessage('Некорректный ID родительской категории')
];

// GET /api/categories - Получение дерева категорий
router.get('/', authenticateToken, async (req, res) => {
    try {
        const tree = await Category.getTree();

        res.json({
            success: true,
            data: tree
        });
    } catch (error) {
        console.error('Get categories error:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения категорий'
        });
    }
});

// GET /api/categories/flat - Получение плоского списка категорий
router.get('/flat', authenticateToken, async (req, res) => {
    try {
        const categories = await Category.find({ isActive: true })
            .sort({ level: 1, order: 1, name: 1 })
            .lean();

        res.json({
            success: true,
            data: categories
        });
    } catch (error) {
        console.error('Get flat categories error:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения категорий'
        });
    }
});

// GET /api/categories/:id - Получение конкретной категории
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const category = await Category.findById(id);
        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'Категория не найдена'
            });
        }

        res.json({
            success: true,
            data: category
        });
    } catch (error) {
        console.error('Get category error:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения категории'
        });
    }
});

// GET /api/categories/:id/materials - Получение материалов категории
router.get('/:id/materials', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { search, page = 1, limit = 20 } = req.query;

        const category = await Category.findById(id);
        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'Категория не найдена'
            });
        }

        const options = {
            categoryId: id,
            userRole: req.user.role,
            limit: parseInt(limit),
            skip: (parseInt(page) - 1) * parseInt(limit)
        };

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
        console.error('Get category materials error:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения материалов категории'
        });
    }
});

// POST /api/categories - Создание новой категории (только админ)
router.post('/', [authenticateToken, requireAdmin, ...categoryValidation], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Ошибки валидации',
                errors: errors.array()
            });
        }

        const { name, description, parentId, order } = req.body;

        // Проверяем, существует ли родительская категория
        if (parentId) {
            const parentCategory = await Category.findById(parentId);
            if (!parentCategory) {
                return res.status(400).json({
                    success: false,
                    message: 'Родительская категория не найдена'
                });
            }
        }

        const category = new Category({
            name,
            description,
            parentId: parentId || null,
            order: order || 0
        });

        await category.save();

        res.status(201).json({
            success: true,
            message: 'Категория создана успешно',
            data: category
        });
    } catch (error) {
        console.error('Create category error:', error);
        if (error.code === 11000) {
            res.status(400).json({
                success: false,
                message: 'Категория с таким именем уже существует'
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Ошибка создания категории'
            });
        }
    }
});

// PUT /api/categories/:id - Обновление категории (только админ)
router.put('/:id', [authenticateToken, requireAdmin, ...categoryValidation], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Ошибки валидации',
                errors: errors.array()
            });
        }

        const { id } = req.params;
        const { name, description, parentId, order, isActive } = req.body;

        const category = await Category.findById(id);
        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'Категория не найдена'
            });
        }

        // Проверяем, что категория не пытается стать дочерней самой себе
        if (parentId === id) {
            return res.status(400).json({
                success: false,
                message: 'Категория не может быть родительской для самой себя'
            });
        }

        // Проверяем, существует ли родительская категория
        if (parentId && parentId !== category.parentId?.toString()) {
            const parentCategory = await Category.findById(parentId);
            if (!parentCategory) {
                return res.status(400).json({
                    success: false,
                    message: 'Родительская категория не найдена'
                });
            }
        }

        // Обновляем поля
        category.name = name;
        category.description = description;
        category.parentId = parentId || null;
        category.order = order !== undefined ? order : category.order;
        category.isActive = isActive !== undefined ? isActive : category.isActive;

        await category.save();

        res.json({
            success: true,
            message: 'Категория обновлена успешно',
            data: category
        });
    } catch (error) {
        console.error('Update category error:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка обновления категории'
        });
    }
});

// DELETE /api/categories/:id - Удаление категории (только админ)
router.delete('/:id', [authenticateToken, requireAdmin], async (req, res) => {
    try {
        const { id } = req.params;

        const category = await Category.findById(id);
        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'Категория не найдена'
            });
        }

        // Проверяем, есть ли дочерние категории
        const childCategories = await Category.find({ parentId: id });
        if (childCategories.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Нельзя удалить категорию, которая содержит дочерние категории'
            });
        }

        // Проверяем, есть ли материалы в категории
        const materialsCount = await Material.countDocuments({ categoryId: id, isActive: true });
        if (materialsCount > 0) {
            return res.status(400).json({
                success: false,
                message: 'Нельзя удалить категорию, которая содержит материалы'
            });
        }

        await Category.findByIdAndDelete(id);

        res.json({
            success: true,
            message: 'Категория удалена успешно'
        });
    } catch (error) {
        console.error('Delete category error:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка удаления категории'
        });
    }
});

module.exports = router; 