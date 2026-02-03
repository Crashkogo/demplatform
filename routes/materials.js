const express = require('express');
const { body, validationResult } = require('express-validator');
const path = require('path');
const fs = require('fs');
const { Material, Category } = require('../models');
const { authenticateToken } = require('../middleware/auth');
const { checkAccess, addAccessibleCategories } = require('../middleware/authorization');
const { handleUpload, deleteFile } = require('../middleware/upload');
const { logEvent } = require('../services/auditService');
const convertService = require('../services/convertService');

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
        .notEmpty()
        .withMessage('Категория обязательна')
        .custom((value) => {
            const parsed = parseInt(value);
            if (isNaN(parsed) || parsed <= 0) {
                throw new Error('Некорректный ID категории');
            }
            return true;
        })
];

// Вспомогательная функция для получения полного пути категории
async function getCategoryPath(categoryId) {
    if (!categoryId) return '';

    const category = await Category.findByPk(categoryId);
    if (!category) return '';

    // Используем поле path, которое уже есть в модели
    const pathIds = category.path.split('/').filter(Boolean);
    
    const categories = await Category.findAll({
        where: {
            id: pathIds
        },
        order: [['level', 'ASC']]
    });

    const categoryMap = new Map(categories.map(c => [c.id.toString(), c.name]));
    const pathNames = pathIds.map(id => categoryMap.get(id.toString()));

    if (pathNames.length === 1) {
        return `*/${pathNames[0]}`;
    }

    return pathNames.join('/');
}

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

// GET /api/materials - Поиск материалов с учетом прав доступа
router.get('/', [authenticateToken, addAccessibleCategories], async (req, res) => {
    try {
        const {
            search,
            categoryId,
            fileType,
            page = 1,
            limit = 20
        } = req.query;

        const options = {
            categoryId: categoryId ? parseInt(categoryId) : undefined,
            fileType,
            limit: parseInt(limit),
            offset: (parseInt(page) - 1) * parseInt(limit)
        };

        // Если пользователь не имеет доступа ко всем категориям, фильтруем по доступным
        if (req.accessibleCategories !== 'all') {
            options.accessibleCategoryIds = req.accessibleCategories;
        }

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
router.get('/:id', [authenticateToken, addAccessibleCategories], async (req, res) => {
    try {
        const { id } = req.params;

        const material = await Material.findByPk(id, {
            include: [
                {
                    model: Category,
                    as: 'category',
                    attributes: ['id', 'name', 'path']
                },
                {
                    model: require('../models').User,
                    as: 'uploader',
                    attributes: ['id', 'login']
                }
            ]
        });

        if (!material) {
            return res.status(404).json({
                success: false,
                message: 'Материал не найден'
            });
        }

        // Проверяем доступ к категории материала
        if (req.accessibleCategories !== 'all') {
            if (!req.accessibleCategories.includes(material.categoryId)) {
                return res.status(403).json({
                    success: false,
                    message: 'Доступ к материалу запрещен'
                });
            }
        }

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
router.get('/:id/view', [authenticateToken, addAccessibleCategories], async (req, res) => {
    try {
        const { id } = req.params;

        const material = await Material.findByPk(id);
        if (!material) {
            return res.status(404).json({
                success: false,
                message: 'Материал не найден'
            });
        }

        // Проверяем наличие права на просмотр материалов
        const user = req.user;
        const role = user.roleData;

        if (!role) {
            console.error('❌ Роль не найдена для пользователя:', user.login);
            return res.status(403).json({
                success: false,
                message: 'Роль пользователя не найдена'
            });
        }

        // Администратор или полный доступ - разрешаем
        if (role.isAdmin || role.canManageAllCategories) {
            console.log('✅ Администратор или полный доступ - просмотр разрешен');
        } else if (!role.canViewMaterials) {
            // Проверяем право на просмотр материалов
            return res.status(403).json({
                success: false,
                message: 'Доступ запрещен: нет права на просмотр материалов'
            });
        } else if (req.accessibleCategories !== 'all') {
            // Проверяем доступ к категории материала
            if (!req.accessibleCategories.includes(material.categoryId)) {
                return res.status(403).json({
                    success: false,
                    message: 'Доступ к просмотру материала запрещен'
                });
            }
        }

        const filePath = path.resolve(material.filePath);

        // Проверяем существование файла
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                message: 'Файл не найден'
            });
        }

        // Увеличиваем счетчик просмотров (асинхронно, не блокируем просмотр)
        material.incrementView().catch(err =>
            console.error('Error incrementing view count:', err)
        );

        // Получаем статистику файла
        const stat = fs.statSync(filePath);
        const fileSize = stat.size;

        // Устанавливаем правильные заголовки
        res.setHeader('Content-Type', material.mimeType);
        res.setHeader('Content-Disposition', `inline; filename="${material.originalName}"`);
        res.setHeader('Content-Length', fileSize);

        // Поддержка Range requests для видео и больших файлов
        const range = req.headers.range;
        if (range && (material.mimeType.startsWith('video/') || fileSize > 10 * 1024 * 1024)) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunksize = (end - start) + 1;

            res.status(206);
            res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
            res.setHeader('Accept-Ranges', 'bytes');
            res.setHeader('Content-Length', chunksize);

            const stream = fs.createReadStream(filePath, { start, end });
            stream.pipe(res);
        } else {
            // Для небольших файлов используем обычную отправку
            res.sendFile(filePath);
        }
    } catch (error) {
        console.error('View material error:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка просмотра материала'
        });
    }
});

// GET /api/materials/:id/preview-pdf - Конвертация RTF в PDF для просмотра
router.get('/:id/preview-pdf', [authenticateToken, addAccessibleCategories], async (req, res) => {
    try {
        const { id } = req.params;

        const material = await Material.findByPk(id);
        if (!material) {
            return res.status(404).json({
                success: false,
                message: 'Материал не найден'
            });
        }

        // Проверяем права доступа
        const user = req.user;
        const role = user.roleData;

        if (!role) {
            return res.status(403).json({
                success: false,
                message: 'Роль пользователя не найдена'
            });
        }

        if (role.isAdmin || role.canManageAllCategories) {
            // Администратор - доступ разрешен
        } else if (!role.canViewMaterials) {
            return res.status(403).json({
                success: false,
                message: 'Доступ запрещен: нет права на просмотр материалов'
            });
        } else if (req.accessibleCategories !== 'all') {
            if (!req.accessibleCategories.includes(material.categoryId)) {
                return res.status(403).json({
                    success: false,
                    message: 'Доступ к просмотру материала запрещен'
                });
            }
        }

        // Проверяем, что это RTF файл
        const fileName = material.originalName?.toLowerCase() || '';
        const isRTF = fileName.endsWith('.rtf') ||
            material.mimeType === 'application/rtf' ||
            material.mimeType === 'text/rtf';

        if (!isRTF) {
            return res.status(400).json({
                success: false,
                message: 'Этот маршрут только для RTF файлов'
            });
        }

        const filePath = path.resolve(material.filePath);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                message: 'Файл не найден'
            });
        }

        // Проверяем доступность LibreOffice
        const isLibreOfficeAvailable = await convertService.isLibreOfficeInstalled();
        if (!isLibreOfficeAvailable) {
            return res.status(503).json({
                success: false,
                message: 'LibreOffice не установлен на сервере. Установите LibreOffice для конвертации RTF.'
            });
        }

        console.log('Начинаем конвертацию RTF в PDF:', filePath);

        // Конвертируем RTF в PDF
        const pdfBuffer = await convertService.convertRTFtoPDF(filePath);

        // Увеличиваем счетчик просмотров
        material.incrementView().catch(err =>
            console.error('Error incrementing view count:', err)
        );

        // Отправляем PDF
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${material.originalName.replace(/\.rtf$/i, '.pdf')}"`);
        res.setHeader('Content-Length', pdfBuffer.length);
        res.send(pdfBuffer);

    } catch (error) {
        console.error('RTF to PDF conversion error:', error);
        res.status(500).json({
            success: false,
            message: `Ошибка конвертации: ${error.message}`
        });
    }
});

// GET /api/materials/:id/download - Скачивание файла материала
router.get('/:id/download', [authenticateToken, addAccessibleCategories], async (req, res) => {
    try {
        const { id } = req.params;

        const material = await Material.findByPk(id);
        if (!material) {
            return res.status(404).json({
                success: false,
                message: 'Материал не найден'
            });
        }

        // Проверяем наличие права на скачивание материалов
        const user = req.user;
        const role = user.roleData;

        if (!role) {
            console.error('❌ Роль не найдена для пользователя:', user.login);
            return res.status(403).json({
                success: false,
                message: 'Роль пользователя не найдена'
            });
        }

        // Администратор или полный доступ - разрешаем
        if (role.isAdmin || role.canManageAllCategories) {
            console.log('✅ Администратор или полный доступ - скачивание разрешено');
        } else if (!role.canDownloadMaterials) {
            // Проверяем право на скачивание материалов
            return res.status(403).json({
                success: false,
                message: 'Доступ запрещен: нет права на скачивание материалов'
            });
        } else if (req.accessibleCategories !== 'all') {
            // Проверяем доступ к категории материала
            if (!req.accessibleCategories.includes(material.categoryId)) {
                return res.status(403).json({
                    success: false,
                    message: 'Доступ к скачиванию материала запрещен'
                });
            }
        }

        const filePath = path.resolve(material.filePath);

        // Проверяем существование файла
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                message: 'Файл не найден'
            });
        }

        // Увеличиваем счетчик скачиваний (асинхронно, не блокируем скачивание)
        material.incrementDownload().catch(err =>
            console.error('Error incrementing download count:', err)
        );

        // Логируем событие скачивания
        const categoryPath = await getCategoryPath(material.categoryId);
        logEvent(req.user.id, 'DOWNLOAD_MATERIAL', {
            'Путь к категории': categoryPath,
            'Название материала': material.title
        });

        // Получаем статистику файла
        const stat = fs.statSync(filePath);
        const fileSize = stat.size;

        // Устанавливаем заголовки для скачивания
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${material.originalName}"`);
        res.setHeader('Content-Length', fileSize);

        // Поддержка Range requests для больших файлов
        const range = req.headers.range;
        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunksize = (end - start) + 1;

            res.status(206);
            res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
            res.setHeader('Accept-Ranges', 'bytes');
            res.setHeader('Content-Length', chunksize);

            const stream = fs.createReadStream(filePath, { start, end });
            stream.pipe(res);
        } else {
            // Отправляем файл полностью
            const stream = fs.createReadStream(filePath);
            stream.pipe(res);
        }
    } catch (error) {
        console.error('Download material error:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка скачивания материала'
        });
    }
});

// POST /api/materials - Создание нового материала
router.post('/', [authenticateToken, checkAccess('canCreateMaterials'), handleUpload], async (req, res) => {
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

        const { title, description } = req.body;
        const categoryId = parseInt(req.body.categoryId);

        // Проверяем существование категории
        const category = await Category.findByPk(categoryId);
        if (!category) {
            if (req.file) {
                deleteFile(req.file.path);
            }
            return res.status(400).json({
                success: false,
                message: 'Категория не найдена'
            });
        }

        // Парсим tags из JSON строки
        let tags = [];

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
            tags,
            fileType: determineFileType(req.file.mimetype),
            mimeType: req.file.mimetype
        });

        console.log('Материал перед сохранением:', {
            title,
            fileType: determineFileType(req.file.mimetype),
            mimeType: req.file.mimetype
        });

        const material = await Material.create({
            title,
            description,
            filename: req.file.filename,
            originalName: req.file.originalname,
            filePath: req.file.path,
            fileSize: req.file.size,
            mimeType: req.file.mimetype,
            categoryId,
            uploadedBy: req.user.id,
            tags,
            fileType: determineFileType(req.file.mimetype)
        });

        console.log('Материал сохранен успешно с ID:', material.id);

        // Получаем материал с связанными данными
        const materialWithAssociations = await Material.findByPk(material.id, {
            include: [
                {
                    model: Category,
                    as: 'category',
                    attributes: ['id', 'name', 'path']
                },
                {
                    model: require('../models').User,
                    as: 'uploader',
                    attributes: ['id', 'login']
                }
            ]
        });

        // Логируем событие
        const categoryPath = await getCategoryPath(material.categoryId);
        logEvent(req.user.id, 'CREATE_MATERIAL', {
            'Путь к категории': categoryPath,
            'Название материала': material.title
        });

        res.status(201).json({
            success: true,
            message: 'Материал загружен успешно',
            data: materialWithAssociations
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

// PUT /api/materials/:id - Обновление материала
router.put('/:id', [authenticateToken, checkAccess('canEditMaterials')], async (req, res) => {
    try {
        const { id } = req.params;
        const { title, description, categoryId } = req.body;

        // Валидация
        if (!title || !categoryId) {
            return res.status(400).json({
                success: false,
                message: 'Название и категория обязательны'
            });
        }

        // Проверяем, что материал существует
        const material = await Material.findByPk(id);
        if (!material) {
            return res.status(404).json({
                success: false,
                message: 'Материал не найден'
            });
        }

        // Проверяем, что категория существует
        const category = await Category.findByPk(categoryId);
        if (!category) {
            return res.status(400).json({
                success: false,
                message: 'Категория не найдена'
            });
        }

        // Обновляем материал
        material.title = title;
        material.description = description || '';
        material.categoryId = categoryId;

        await material.save();

        // Получаем материал с связанными данными
        const materialWithAssociations = await Material.findByPk(material.id, {
            include: [
                {
                    model: Category,
                    as: 'category',
                    attributes: ['id', 'name', 'path']
                },
                {
                    model: require('../models').User,
                    as: 'uploader',
                    attributes: ['id', 'login']
                }
            ]
        });

        res.json({
            success: true,
            message: 'Материал обновлен успешно',
            data: materialWithAssociations
        });

        // Логируем событие
        const categoryPath = await getCategoryPath(material.categoryId);
        logEvent(req.user.id, 'UPDATE_MATERIAL', {
            'Путь к категории': categoryPath,
            'Название материала': material.title
        });

    } catch (error) {
        console.error('Update material error:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка обновления материала'
        });
    }
});

// DELETE /api/materials/:id - Удаление материала
router.delete('/:id', [authenticateToken, checkAccess('canDeleteMaterials')], async (req, res) => {
    try {
        const { id } = req.params;

        const material = await Material.findByPk(id);
        if (!material) {
            return res.status(404).json({
                success: false,
                message: 'Материал не найден'
            });
        }

        // Логируем событие перед удалением
        const categoryPath = await getCategoryPath(material.categoryId);
        logEvent(req.user.id, 'DELETE_MATERIAL', {
            'Путь к категории': categoryPath,
            'Название материала': material.title
        });

        // Удаляем файл с диска
        deleteFile(material.filePath);

        // Удаляем запись из базы данных
        await material.destroy();

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
