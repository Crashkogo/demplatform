const express = require('express');
const { body, validationResult } = require('express-validator');
const path = require('path');
const fs = require('fs');
const Material = require('../models/Material');
const Category = require('../models/Category');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { handleUpload, deleteFile } = require('../middleware/upload');

const router = express.Router();

// Валидаторы
const materialValidation = [
    body('title')
        .isLength({ min: 1, max: 200 })
        .withMessage('Название материала должно содержать от 1 до 200 символов')
        .trim(),
    body('description')
        .optional()
        .isLength({ max: 1000 })
        .withMessage('Описание не может превышать 1000 символов')
        .trim(),
    body('categoryId')
        .isMongoId()
        .withMessage('Некорректный ID категории')
];

// Функция для определения типа файла по MIME-типу
function determineFileType(mimeType) {
    if (!mimeType) return 'other';

    if (mimeType.startsWith('video/')) {
        return 'video';
    } else if (mimeType.startsWith('image/')) {
        return 'image';
    } else if (
        mimeType.includes('pdf') ||
        mimeType.includes('document') ||
        mimeType.includes('word') ||
        mimeType.includes('excel') ||
        mimeType.includes('spreadsheet') ||
        mimeType.includes('presentation') ||
        mimeType.includes('odt') ||
        mimeType.includes('ods') ||
        mimeType.includes('odp') ||
        mimeType.includes('text/')
    ) {
        return 'document';
    } else {
        return 'other';
    }
}

// GET /api/materials - Поиск материалов
router.get('/', authenticateToken, async (req, res) => {
    try {
        const {
            search,
            categoryId,
            fileType,
            page = 1,
            limit = 20
        } = req.query;

        const options = {
            categoryId,
            fileType,
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
        console.error('Search materials error:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка поиска материалов'
        });
    }
});

// GET /api/materials/:id - Получение конкретного материала
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const material = await Material.findById(id)
            .populate('categoryId', 'name path')
            .populate('uploadedBy', 'login');

        if (!material) {
            return res.status(404).json({
                success: false,
                message: 'Материал не найден'
            });
        }

        // Убираем проверку доступа - все материалы доступны всем

        res.json({
            success: true,
            data: material
        });
    } catch (error) {
        console.error('Get material error:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка получения материала'
        });
    }
});

// GET /api/materials/:id/view - Просмотр файла материала
router.get('/:id/view', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const material = await Material.findById(id);
        if (!material) {
            return res.status(404).json({
                success: false,
                message: 'Материал не найден'
            });
        }

        // Убираем проверку доступа - все материалы доступны всем

        const filePath = path.resolve(material.filePath);

        // Проверяем существование файла
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                message: 'Файл не найден'
            });
        }

        // Увеличиваем счетчик просмотров
        await material.incrementView();

        // Устанавливаем правильные заголовки
        res.setHeader('Content-Type', material.mimeType);
        res.setHeader('Content-Disposition', `inline; filename="${material.originalName}"`);

        // Отправляем файл
        res.sendFile(filePath);
    } catch (error) {
        console.error('View material error:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка просмотра материала'
        });
    }
});

// GET /api/materials/:id/download - Скачивание файла материала
router.get('/:id/download', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const material = await Material.findById(id);
        if (!material) {
            return res.status(404).json({
                success: false,
                message: 'Материал не найден'
            });
        }

        // Убираем проверку доступа - все материалы доступны всем

        const filePath = path.resolve(material.filePath);

        // Проверяем существование файла
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                message: 'Файл не найден'
            });
        }

        // Увеличиваем счетчик скачиваний
        await material.incrementDownload();

        // Устанавливаем заголовки для скачивания
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${material.originalName}"`);

        // Отправляем файл
        res.sendFile(filePath);
    } catch (error) {
        console.error('Download material error:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка скачивания материала'
        });
    }
});

// POST /api/materials - Создание нового материала (только админ)
router.post('/', [authenticateToken, requireAdmin, handleUpload], async (req, res) => {
    try {
        // Валидация после загрузки файла
        await Promise.all(materialValidation.map(validation => validation.run(req)));

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            // Удаляем загруженный файл в случае ошибки валидации
            if (req.file) {
                deleteFile(req.file.path);
            }
            return res.status(400).json({
                success: false,
                message: 'Ошибки валидации',
                errors: errors.array()
            });
        }

        const { title, description, categoryId } = req.body;

        // Проверяем существование категории
        const category = await Category.findById(categoryId);
        if (!category) {
            if (req.file) {
                deleteFile(req.file.path);
            }
            return res.status(400).json({
                success: false,
                message: 'Категория не найдена'
            });
        }

        // Парсим accessRoles и tags из JSON строк
        let accessRoles = ['client']; // По умолчанию
        let tags = [];

        console.log('Исходные данные accessRoles:', req.body.accessRoles, 'тип:', typeof req.body.accessRoles);

        if (req.body.accessRoles) {
            try {
                accessRoles = typeof req.body.accessRoles === 'string'
                    ? JSON.parse(req.body.accessRoles)
                    : req.body.accessRoles;

                console.log('Парсенные accessRoles:', accessRoles);

                // Валидируем роли
                const validRoles = ['admin', 'client'];
                if (!Array.isArray(accessRoles) || !accessRoles.every(role => validRoles.includes(role))) {
                    console.error('Некорректные роли доступа:', accessRoles);
                    if (req.file) {
                        deleteFile(req.file.path);
                    }
                    return res.status(400).json({
                        success: false,
                        message: 'Некорректные роли доступа'
                    });
                }
            } catch (e) {
                console.error('Ошибка парсинга accessRoles:', e);
                if (req.file) {
                    deleteFile(req.file.path);
                }
                return res.status(400).json({
                    success: false,
                    message: 'Некорректный формат ролей доступа'
                });
            }
        }

        console.log('Финальные accessRoles:', accessRoles);

        if (req.body.tags) {
            try {
                tags = typeof req.body.tags === 'string'
                    ? JSON.parse(req.body.tags)
                    : req.body.tags;

                if (!Array.isArray(tags)) {
                    tags = [];
                }
            } catch (e) {
                tags = [];
            }
        }

        console.log('Создаем материал с данными:', {
            title,
            description,
            filename: req.file.filename,
            originalName: req.file.originalname,
            categoryId,
            accessRoles,
            tags,
            fileType: determineFileType(req.file.mimetype),
            mimeType: req.file.mimetype
        });

        const material = new Material({
            title,
            description,
            filename: req.file.filename,
            originalName: req.file.originalname,
            filePath: req.file.path,
            fileSize: req.file.size,
            mimeType: req.file.mimetype,
            categoryId,
            accessRoles,
            uploadedBy: req.user._id,
            tags,
            fileType: determineFileType(req.file.mimetype)
        });

        console.log('Материал перед сохранением:', {
            title: material.title,
            accessRoles: material.accessRoles,
            fileType: material.fileType,
            mimeType: material.mimeType
        });

        await material.save();

        console.log('Материал сохранен успешно с ID:', material._id);

        // Популяция для ответа
        await material.populate(['categoryId', 'uploadedBy']);

        res.status(201).json({
            success: true,
            message: 'Материал загружен успешно',
            data: material
        });
    } catch (error) {
        // Удаляем загруженный файл в случае ошибки
        if (req.file) {
            deleteFile(req.file.path);
        }

        console.error('Create material error:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка загрузки материала'
        });
    }
});

// PUT /api/materials/:id - Обновление материала (только админ)
router.put('/:id', [authenticateToken, requireAdmin, ...materialValidation], async (req, res) => {
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
        const { title, description, categoryId, isActive } = req.body;

        const material = await Material.findById(id);
        if (!material) {
            return res.status(404).json({
                success: false,
                message: 'Материал не найден'
            });
        }

        // Проверяем существование категории
        if (categoryId !== material.categoryId.toString()) {
            const category = await Category.findById(categoryId);
            if (!category) {
                return res.status(400).json({
                    success: false,
                    message: 'Категория не найдена'
                });
            }
        }

        // Обновляем поля
        material.title = title;
        material.description = description;
        material.categoryId = categoryId;
        material.isActive = isActive !== undefined ? isActive : material.isActive;

        await material.save();
        await material.populate(['categoryId', 'uploadedBy']);

        res.json({
            success: true,
            message: 'Материал обновлен успешно',
            data: material
        });
    } catch (error) {
        console.error('Update material error:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка обновления материала'
        });
    }
});

// DELETE /api/materials/:id - Удаление материала (только админ)
router.delete('/:id', [authenticateToken, requireAdmin], async (req, res) => {
    try {
        const { id } = req.params;

        const material = await Material.findById(id);
        if (!material) {
            return res.status(404).json({
                success: false,
                message: 'Материал не найден'
            });
        }

        // Удаляем файл с диска
        deleteFile(material.filePath);

        // Удаляем запись из базы данных
        await Material.findByIdAndDelete(id);

        res.json({
            success: true,
            message: 'Материал удален успешно'
        });
    } catch (error) {
        console.error('Delete material error:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка удаления материала'
        });
    }
});

module.exports = router; 