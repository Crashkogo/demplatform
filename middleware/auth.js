const jwt = require('jsonwebtoken');
const { User } = require('../models');
const config = require('../config');
const logger = require('../utils/logger');

// Кэш пользователей в памяти — снижает нагрузку на БД при частых запросах
const USER_CACHE_TTL = 5 * 60 * 1000; // 5 минут
const _userCache = new Map();

function _getCached(userId) {
    const entry = _userCache.get(userId);
    if (!entry) return null;
    if (Date.now() - entry.ts > USER_CACHE_TTL) { _userCache.delete(userId); return null; }
    return entry.user;
}

function _setCache(userId, user) {
    _userCache.set(userId, { user, ts: Date.now() });
}

// Инвалидация кэша конкретного пользователя (смена роли, пароля, логина)
function invalidateUserCache(userId) {
    _userCache.delete(Number(userId));
}

// Инвалидация всего кэша (при изменении прав роли)
function invalidateAllUserCache() {
    _userCache.clear();
}

// Middleware для проверки JWT токена
const authenticateToken = async (req, res, next) => {
    try {
        // Читаем токен из httpOnly cookie (приоритет) или из заголовка Authorization
        const token = req.cookies?.authToken || (req.headers['authorization']?.split(' ')[1]);

        if (!token) {
            logger.warn('Токен не предоставлен для:', req.method, req.originalUrl);
            return res.status(401).json({
                success: false,
                message: 'Токен доступа не предоставлен'
            });
        }

        const decoded = jwt.verify(token, config.jwtSecret);
        logger.debug('Токен верифицирован для пользователя ID:', decoded.userId);

        // Проверяем кэш — если есть актуальная запись, пропускаем запрос к БД
        let user = _getCached(decoded.userId);

        if (!user) {
            // Загружаем пользователя с ролью
            const { Role } = require('../models');
            user = await User.findByPk(decoded.userId, {
                attributes: { exclude: ['password'] },
                include: [{
                    model: Role,
                    as: 'roleData',
                    include: [{
                        association: 'allowedCategories',
                        through: { attributes: [] }
                    }]
                }]
            });

            if (user) _setCache(decoded.userId, user);
        }

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Пользователь не найден'
            });
        }

        // Проверяем наличие роли
        if (!user.roleData) {
            logger.error('Роль не найдена для пользователя:', user.login);
            return res.status(403).json({
                success: false,
                message: 'Роль пользователя не найдена. Обратитесь к администратору.'
            });
        }

        req.user = user;
        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Недействительный токен'
            });
        }
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Срок действия токена истек'
            });
        }

        logger.error('Auth middleware error:', error);
        res.status(500).json({
            success: false,
            message: 'Внутренняя ошибка сервера'
        });
    }
};

// Middleware для проверки роли администратора
const requireAdmin = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'Требуется аутентификация'
        });
    }

    // Используем уже загруженные данные роли из authenticateToken
    const role = req.user.roleData;

    if (!role) {
        return res.status(403).json({
            success: false,
            message: 'Роль не назначена'
        });
    }

    if (!role.isAdmin) {
        return res.status(403).json({
            success: false,
            message: 'Требуются права администратора'
        });
    }

    next();
};

// Функция для генерации JWT токена
const generateToken = (userId) => {
    return jwt.sign({ userId }, config.jwtSecret, {
        expiresIn: config.jwtExpiresIn
    });
};

module.exports = {
    authenticateToken,
    requireAdmin,
    generateToken,
    invalidateUserCache,
    invalidateAllUserCache
}; 