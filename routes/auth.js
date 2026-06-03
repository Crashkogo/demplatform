const express = require('express');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const { User, Role } = require('../models');
const { generateToken, authenticateToken } = require('../middleware/auth');
const config = require('../config');
const logger = require('../utils/logger');

const isProd = process.env.NODE_ENV === 'production';

const cookieOptions = {
    httpOnly: true,
    secure: isProd,
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000
};

const router = express.Router();

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Слишком много попыток входа. Попробуйте через 15 минут.' }
});

const MATERIAL_PERMISSIONS = [
    'canViewMaterials', 'canDownloadMaterials', 'canCreateMaterials',
    'canEditMaterials', 'canDeleteMaterials'
];

/**
 * Для каждого права на материалы вычисляет список ID категорий,
 * где это право реально работает (та же роль даёт и право, и доступ).
 */
async function computeCategoryPermissions(roles) {
    const result = {};
    for (const perm of MATERIAL_PERMISSIONS) {
        const relevant = roles.filter(r => r.isAdmin || r.canManageAllCategories || r[perm]);
        if (relevant.some(r => r.isAdmin || r.canManageAllCategories)) {
            result[perm] = 'all';
        } else {
            const ids = new Set();
            for (const r of relevant) {
                const cats = await r.getAccessibleCategories();
                cats.forEach(c => ids.add(c.id));
            }
            result[perm] = Array.from(ids);
        }
    }
    return result;
}

/**
 * Формирует ответ клиенту: объединяет права из всех ролей пользователя.
 * Фронтенд ждёт поле Role с объединёнными правами.
 */
function buildUserWithRoles(userObject, roles) {
    // Объединяем все права по OR
    const merged = roles.reduce((acc, r) => {
        const perms = r.getPermissions ? r.getPermissions() : {};
        Object.keys(perms).forEach(k => {
            if (typeof perms[k] === 'boolean') acc[k] = acc[k] || perms[k];
        });
        if (r.isAdmin) acc.isAdmin = true;
        if (r.categoryAccessType === 'all') acc.categoryAccessType = 'all';
        return acc;
    }, { categoryAccessType: 'selected' });

    return {
        ...userObject,
        Role: {
            id: roles[0]?.id,
            name: roles.map(r => r.name).join(', '),
            description: roles[0]?.description,
            ...merged,
            allowedCategories: roles.flatMap(r => r.allowedCategories || [])
        }
    };
}

const loginValidation = [
    body('login').isLength({ min: 3, max: 50 }).withMessage('Логин должен содержать от 3 до 50 символов').trim(),
    body('password').isLength({ min: 6 }).withMessage('Пароль должен содержать минимум 6 символов')
];

// POST /api/auth/login
router.post('/login', loginLimiter, loginValidation, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, message: 'Ошибки валидации', errors: errors.array() });
        }

        const { login, password } = req.body;

        logger.debug('Ищем пользователя:', login);
        const user = await User.findOne({
            where: { login },
            include: [{
                model: Role,
                as: 'roles',
                through: { attributes: [] },
                include: [{ association: 'allowedCategories', through: { attributes: [] } }]
            }]
        });

        if (!user) {
            return res.status(401).json({ success: false, message: 'Неверный логин или пароль' });
        }

        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) {
            return res.status(401).json({ success: false, message: 'Неверный логин или пароль' });
        }

        const roles = user.roles || [];
        if (roles.length === 0) {
            return res.status(403).json({ success: false, message: 'Роли не назначены. Обратитесь к администратору.' });
        }

        logger.debug('Роли загружены:', roles.map(r => r.name).join(', '));

        user.lastLogin = new Date();
        await user.save();

        const token = generateToken(user.id);

        // Получаем объединённые права
        const permissions = await user.getPermissions();
        logger.debug('Права получены:', Object.keys(permissions).length);

        const accessibleCategories = await user.getAccessibleCategories();
        const accessibleCategoryIds = accessibleCategories.map(cat => cat.id);

        const categoryPermissions = await computeCategoryPermissions(roles);

        const userObject = user.toSafeObject();
        const userWithRole = buildUserWithRoles(userObject, roles);

        res.cookie('authToken', token, cookieOptions);

        logger.debug('Логин успешен:', { login: userWithRole.login, roles: roles.map(r => r.name) });

        res.json({
            success: true,
            message: 'Успешная авторизация',
            user: userWithRole,
            permissions,
            accessibleCategoryIds,
            categoryPermissions
        });

    } catch (error) {
        logger.error('Login error:', error);
        res.status(500).json({ success: false, message: 'Внутренняя ошибка сервера' });
    }
});

// GET /api/auth/me
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const roles = req.user.roles || [];
        const userObject = req.user.toSafeObject();
        const userWithRole = buildUserWithRoles(userObject, roles);
        const categoryPermissions = await computeCategoryPermissions(roles);

        logger.debug('/api/auth/me:', { login: userWithRole.login, roles: roles.map(r => r.name) });

        res.json({ success: true, user: userWithRole, categoryPermissions });
    } catch (error) {
        logger.error('Get user info error:', error);
        res.status(500).json({ success: false, message: 'Внутренняя ошибка сервера' });
    }
});

// POST /api/auth/logout
router.post('/logout', authenticateToken, (req, res) => {
    res.clearCookie('authToken', { httpOnly: true, secure: isProd, sameSite: 'strict' });
    res.json({ success: true, message: 'Успешный выход из системы' });
});

// POST /api/auth/verify
router.post('/verify', authenticateToken, (req, res) => {
    res.json({ success: true, message: 'Токен действителен', user: req.user.toSafeObject() });
});

module.exports = router;
