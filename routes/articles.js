const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Op } = require('sequelize');
const { Article, ArticleSection, HeaderImage, User } = require('../models');
const { authenticateToken } = require('../middleware/auth');
const { checkAccess } = require('../middleware/authorization');
const logger = require('../utils/logger');

// Multer для загрузки изображений шапки
const headerImageStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, '../uploads/header-images');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `header-${Date.now()}${ext}`);
    }
});
const headerUpload = multer({
    storage: headerImageStorage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Только изображения'));
    }
});

// Middleware: право на чтение статей
const canRead = (req, res, next) => {
    const role = req.user.roleData;
    if (!role) return res.status(403).json({ success: false, message: 'Нет доступа' });
    if (role.isAdmin || role.canReadArticles || role.canCreateArticles) return next();
    return res.status(403).json({ success: false, message: 'Нет доступа к статьям' });
};

// Middleware: право на создание/редактирование статей
const canCreate = (req, res, next) => {
    const role = req.user.roleData;
    if (!role) return res.status(403).json({ success: false, message: 'Нет доступа' });
    if (role.isAdmin || role.canCreateArticles) return next();
    return res.status(403).json({ success: false, message: 'Нет права создавать статьи' });
};

// ============================================================
// ARTICLE SECTIONS
// ============================================================

// GET /api/article-sections
router.get('/article-sections', authenticateToken, canRead, async (req, res) => {
    try {
        const sections = await ArticleSection.findAll({ order: [['name', 'ASC']] });
        res.json({ success: true, data: sections });
    } catch (err) {
        logger.error('GET /article-sections:', err);
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
});

// POST /api/article-sections
router.post('/article-sections', authenticateToken, canCreate, async (req, res) => {
    try {
        const { name } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, message: 'Название обязательно' });
        }
        const section = await ArticleSection.create({ name: name.trim() });
        res.status(201).json({ success: true, data: section });
    } catch (err) {
        logger.error('POST /article-sections:', err);
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
});

// PUT /api/article-sections/:id
router.put('/article-sections/:id', authenticateToken, canCreate, async (req, res) => {
    try {
        const section = await ArticleSection.findByPk(req.params.id);
        if (!section) return res.status(404).json({ success: false, message: 'Раздел не найден' });
        const { name } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, message: 'Название обязательно' });
        }
        await section.update({ name: name.trim() });
        res.json({ success: true, data: section });
    } catch (err) {
        logger.error('PUT /article-sections/:id:', err);
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
});

// DELETE /api/article-sections/:id
router.delete('/article-sections/:id', authenticateToken, canCreate, async (req, res) => {
    try {
        const section = await ArticleSection.findByPk(req.params.id);
        if (!section) return res.status(404).json({ success: false, message: 'Раздел не найден' });
        await section.destroy();
        res.json({ success: true, message: 'Раздел удалён' });
    } catch (err) {
        logger.error('DELETE /article-sections/:id:', err);
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
});

// ============================================================
// ARTICLES
// ============================================================

// GET /api/articles
router.get('/articles', authenticateToken, canRead, async (req, res) => {
    try {
        const { search, dateFrom, dateTo, sectionId } = req.query;
        const where = {};

        if (search) {
            where.title = { [Op.iLike]: `%${search}%` };
        }
        if (dateFrom || dateTo) {
            where.createdAt = {};
            if (dateFrom) where.createdAt[Op.gte] = new Date(dateFrom);
            if (dateTo) {
                const to = new Date(dateTo);
                to.setHours(23, 59, 59, 999);
                where.createdAt[Op.lte] = to;
            }
        }

        const include = [
            { model: ArticleSection, as: 'sections', through: { attributes: [] } },
            { model: User, as: 'author', attributes: ['id', 'login'] }
        ];

        if (sectionId) {
            include[0].where = { id: sectionId };
            include[0].required = true;
        }

        const articles = await Article.findAll({
            where,
            include,
            order: [['createdAt', 'DESC']]
        });

        res.json({ success: true, data: articles });
    } catch (err) {
        logger.error('GET /articles:', err);
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
});

// GET /api/articles/:id
router.get('/articles/:id', authenticateToken, canRead, async (req, res) => {
    try {
        const article = await Article.findByPk(req.params.id, {
            include: [
                { model: ArticleSection, as: 'sections', through: { attributes: [] } },
                { model: User, as: 'author', attributes: ['id', 'login'] }
            ]
        });
        if (!article) return res.status(404).json({ success: false, message: 'Статья не найдена' });
        res.json({ success: true, data: article });
    } catch (err) {
        logger.error('GET /articles/:id:', err);
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
});

// POST /api/articles
router.post('/articles', authenticateToken, canCreate, async (req, res) => {
    try {
        const { title, content, sectionIds } = req.body;
        if (!title || !title.trim()) {
            return res.status(400).json({ success: false, message: 'Заголовок обязателен' });
        }
        const article = await Article.create({
            title: title.trim(),
            content: content || '',
            authorId: req.user.id
        });
        if (Array.isArray(sectionIds) && sectionIds.length > 0) {
            const sections = await ArticleSection.findAll({ where: { id: sectionIds } });
            await article.setSections(sections);
        }
        const result = await Article.findByPk(article.id, {
            include: [
                { model: ArticleSection, as: 'sections', through: { attributes: [] } },
                { model: User, as: 'author', attributes: ['id', 'login'] }
            ]
        });
        res.status(201).json({ success: true, data: result });
    } catch (err) {
        logger.error('POST /articles:', err);
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
});

// PUT /api/articles/:id
router.put('/articles/:id', authenticateToken, canCreate, async (req, res) => {
    try {
        const article = await Article.findByPk(req.params.id);
        if (!article) return res.status(404).json({ success: false, message: 'Статья не найдена' });

        const { title, content, sectionIds } = req.body;
        if (!title || !title.trim()) {
            return res.status(400).json({ success: false, message: 'Заголовок обязателен' });
        }
        await article.update({ title: title.trim(), content: content || '' });

        if (Array.isArray(sectionIds)) {
            const sections = await ArticleSection.findAll({ where: { id: sectionIds } });
            await article.setSections(sections);
        }

        const result = await Article.findByPk(article.id, {
            include: [
                { model: ArticleSection, as: 'sections', through: { attributes: [] } },
                { model: User, as: 'author', attributes: ['id', 'login'] }
            ]
        });
        res.json({ success: true, data: result });
    } catch (err) {
        logger.error('PUT /articles/:id:', err);
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
});

// DELETE /api/articles/:id
router.delete('/articles/:id', authenticateToken, canCreate, async (req, res) => {
    try {
        const article = await Article.findByPk(req.params.id);
        if (!article) return res.status(404).json({ success: false, message: 'Статья не найдена' });
        await article.destroy();
        res.json({ success: true, message: 'Статья удалена' });
    } catch (err) {
        logger.error('DELETE /articles/:id:', err);
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
});

// ============================================================
// HEADER IMAGE
// ============================================================

// GET /api/header-image
router.get('/header-image', authenticateToken, async (req, res) => {
    try {
        const image = await HeaderImage.findOne({ order: [['createdAt', 'DESC']] });
        if (!image) return res.json({ success: true, data: null });
        res.json({ success: true, data: image });
    } catch (err) {
        logger.error('GET /header-image:', err);
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
});

// POST /api/header-image
router.post('/header-image', authenticateToken, canCreate, headerUpload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Файл не загружен' });
        }
        const image = await HeaderImage.create({
            filename: req.file.filename,
            originalName: req.file.originalname,
            path: req.file.path,
            mimeType: req.file.mimetype,
            size: req.file.size,
            uploadedBy: req.user.id
        });
        res.status(201).json({ success: true, data: image });
    } catch (err) {
        logger.error('POST /header-image:', err);
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
});

// GET /api/header-image/file/:filename — отдать файл
router.get('/header-image/file/:filename', authenticateToken, async (req, res) => {
    try {
        const filename = path.basename(req.params.filename);
        const filePath = path.join(__dirname, '../uploads/header-images', filename);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, message: 'Файл не найден' });
        }
        res.sendFile(filePath);
    } catch (err) {
        logger.error('GET /header-image/file:', err);
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
});

module.exports = router;
