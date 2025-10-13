const express = require('express');
const { body, validationResult } = require('express-validator');
const { Category, Material } = require('../models');
const { authenticateToken } = require('../middleware/auth');
const { checkAccess, addAccessibleCategories } = require('../middleware/authorization');

const router = express.Router();

// Простой кэш для категорий (в продакшене лучше использовать Redis)
let categoriesCache = {
    data: null,
    timestamp: null,
    ttl: 5 * 60 * 1000 // 5 минут
};

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
        .optional({ checkFalsy: true, nullable: true })
        .custom((value) => {
            // Обрабатываем все варианты "пустого" значения
            if (value === '' || value === null || value === undefined || value === 'undefined' || value === 'null') {
                return true;
            }
            const parsed = parseInt(value);
            if (isNaN(parsed) || parsed <= 0) {
                throw new Error('Некорректный ID родительской категории');
            }
            return true;
        }),
    body('order')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Порядок должен быть положительным числом')
];

// Функция для инвалидации кэша категорий
function invalidateCategoriesCache() {
    categoriesCache.data = null;
    categoriesCache.timestamp = null;
}

// GET /api/categories - Получение дерева категорий с учетом прав доступа
router.get('/', [authenticateToken, addAccessibleCategories], async (req, res) => {
    try {
        console.log('Запрос категорий от пользователя:', req.user.login);

        // Загружаем все категории
        const allCategories = await Category.findAll({
            where: { isActive: true },
            order: [['level', 'ASC'], ['order', 'ASC'], ['name', 'ASC']]
        });

        let filteredCategories;

        // Если пользователь имеет доступ ко всем категориям
        if (req.accessibleCategories === 'all') {
            filteredCategories = allCategories;
        } else {
            // Фильтруем категории по доступным
            const accessibleIds = new Set(req.accessibleCategories);
            filteredCategories = allCategories.filter(cat => accessibleIds.has(cat.id));
        }

        // Строим дерево из отфильтрованных категорий
        const categoryMap = {};
        const tree = [];

        filteredCategories.forEach(cat => {
            const categoryData = cat.toJSON();
            categoryMap[categoryData.id] = { ...categoryData, children: [] };
        });

        filteredCategories.forEach(cat => {
            const categoryData = cat.toJSON();
            const parentId = categoryData.parentId;

            if (parentId && categoryMap[parentId]) {
                categoryMap[parentId].children.push(categoryMap[categoryData.id]);
            } else {
                tree.push(categoryMap[categoryData.id]);
            }
        });

        console.log('Найдено доступных категорий:', filteredCategories.length);

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

// GET /api/categories/flat - Получение плоского списка категорий с учетом прав
router.get('/flat', [authenticateToken, addAccessibleCategories], async (req, res) => {
    try {
        const allCategories = await Category.findAll({
            where: { isActive: true },
            order: [['level', 'ASC'], ['order', 'ASC'], ['name', 'ASC']]
        });

        let filteredCategories;

        // Если пользователь имеет доступ ко всем категориям
        if (req.accessibleCategories === 'all') {
            filteredCategories = allCategories;
        } else {
            // Фильтруем категории по доступным
            const accessibleIds = new Set(req.accessibleCategories);
            filteredCategories = allCategories.filter(cat => accessibleIds.has(cat.id));
        }

        res.json({
            success: true,
            data: filteredCategories
        });
    } catch (error) {
        console.error('Get flat categories error:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения категорий'
        });
    }
});

// GET /api/categories/accessible - Получение доступных категорий для текущего пользователя
router.get('/accessible', [authenticateToken, addAccessibleCategories], async (req, res) => {
    try {
        let accessibleCategories;

        if (req.accessibleCategories === 'all') {
            // Пользователь имеет доступ ко всем категориям
            accessibleCategories = await Category.findAll({
                where: { isActive: true },
                order: [['level', 'ASC'], ['order', 'ASC'], ['name', 'ASC']]
            });
        } else {
            // Пользователь имеет доступ только к определенным категориям
            accessibleCategories = await Category.findAll({
                where: {
                    id: req.accessibleCategories,
                    isActive: true
                },
                order: [['level', 'ASC'], ['order', 'ASC'], ['name', 'ASC']]
            });
        }

        res.json({
            success: true,
            data: accessibleCategories,
            hasFullAccess: req.accessibleCategories === 'all'
        });
    } catch (error) {
        console.error('Get accessible categories error:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения доступных категорий'
        });
    }
});

// GET /api/categories/:id - Получение конкретной категории
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const category = await Category.findByPk(id);
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

        const category = await Category.findByPk(id);
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

// POST /api/categories - Создание новой категории
router.post('/', [authenticateToken, checkAccess('canCreateCategories'), ...categoryValidation], async (req, res) => {
    try {
        console.log('Создание категории - полученные данные:', req.body);

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            console.log('Ошибки валидации при создании категории:', errors.array());
            return res.status(400).json({
                success: false,
                message: 'Ошибки валидации',
                errors: errors.array()
            });
        }

        const { name, description } = req.body;
        let { parentId, order } = req.body;

        // Нормализуем parentId - пустые строки превращаем в null
        if (parentId === '' || parentId === undefined || parentId === null || parentId === 'undefined' || parentId === 'null') {
            parentId = null;
        } else {
            parentId = parseInt(parentId);
        }

        // Нормализуем order
        order = order ? parseInt(order) : 0;

        // Проверяем, существует ли родительская категория
        if (parentId) {
            const parentCategory = await Category.findByPk(parentId);
            if (!parentCategory) {
                return res.status(400).json({
                    success: false,
                    message: 'Родительская категория не найдена'
                });
            }
        }

        const category = await Category.create({
            name,
            description,
            parentId: parentId || null,
            order: order || 0
        });

        // Инвалидируем кэш категорий
        invalidateCategoriesCache();

        console.log('Категория успешно создана:', {
            id: category.id,
            name: category.name,
            parentId: category.parentId,
            level: category.level
        });

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

// PUT /api/categories/:id - Обновление категории
router.put('/:id', [authenticateToken, checkAccess('canEditCategories'), ...categoryValidation], async (req, res) => {
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
        const { name, description, isActive } = req.body;
        let { parentId, order } = req.body;

        // Нормализуем parentId - пустые строки превращаем в null
        if (parentId === '' || parentId === undefined || parentId === null || parentId === 'undefined' || parentId === 'null') {
            parentId = null;
        } else {
            parentId = parseInt(parentId);
        }

        // Нормализуем order
        order = order !== undefined ? parseInt(order) : undefined;

        const category = await Category.findByPk(id);
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
            const parentCategory = await Category.findByPk(parentId);
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

        // Инвалидируем кэш категорий
        invalidateCategoriesCache();

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

// DELETE /api/categories/:id - Удаление категории
router.delete('/:id', [authenticateToken, checkAccess('canDeleteCategories')], async (req, res) => {
    try {
        const { id } = req.params;

        const category = await Category.findByPk(id);
        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'Категория не найдена'
            });
        }

        // Проверяем, есть ли дочерние категории
        const childCategories = await Category.findAll({ where: { parentId: id } });
        if (childCategories.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Нельзя удалить категорию, которая содержит дочерние категории'
            });
        }

        // Проверяем, есть ли материалы в категории
        const materialsCount = await Material.count({ where: { categoryId: id, isActive: true } });
        if (materialsCount > 0) {
            return res.status(400).json({
                success: false,
                message: 'Нельзя удалить категорию, которая содержит материалы'
            });
        }

        await category.destroy();

        // Инвалидируем кэш категорий
        invalidateCategoriesCache();

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