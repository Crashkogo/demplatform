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

// Инвалидация кэша конкретного пользователя (смена ролей, пароля, логина)
function invalidateUserCache(userId) {
    _userCache.delete(Number(userId));
}

// Принудительный логаут пользователя — инкрементирует tokenVersion в БД.
// Все активные токены становятся недействительными немедленно после очистки кэша.
async function invalidateUserSessions(userId) {
    try {
        const { User } = require('../models');
        await User.increment('tokenVersion', { where: { id: userId } });
        invalidateUserCache(userId);
    } catch (err) {
        logger.error('Ошибка инвалидации сессий пользователя:', err);
    }
}

// Инвалидация всего кэша (при изменении прав роли)
function invalidateAllUserCache() {
    _userCache.clear();
}

// Middleware для проверки JWT токена
const authenticateToken = async (req, res, next) => {
    try {
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

        let user = _getCached(decoded.userId);

        if (!user) {
            const { Role } = require('../models');
            user = await User.findByPk(decoded.userId, {
                attributes: { exclude: ['password'] },
                include: [{
                    model: Role,
                    as: 'roles',
                    through: { attributes: [] },
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

        // Проверяем версию токена — защита от использования старых токенов
        // после принудительного логаута или смены ролей
        if (decoded.tokenVersion !== undefined && decoded.tokenVersion !== user.tokenVersion) {
            return res.status(401).json({ success: false, message: 'Токен отозван. Войдите снова.' });
        }

        req.user = user;
        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ success: false, message: 'Недействительный токен' });
        }
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, message: 'Срок действия токена истек' });
        }

        logger.error('Auth middleware error:', error);
        res.status(500).json({ success: false, message: 'Внутренняя ошибка сервера' });
    }
};

// Middleware для проверки роли администратора
const requireAdmin = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ success: false, message: 'Требуется аутентификация' });
    }

    const roles = req.user.roles || [];
    if (!roles.some(r => r.isAdmin)) {
        return res.status(403).json({ success: false, message: 'Требуются права администратора' });
    }

    next();
};

// Функция для генерации JWT токена
// tokenVersion включается в payload — при инвалидации токен отклоняется
const generateToken = (userId, tokenVersion = 0) => {
    return jwt.sign({ userId, tokenVersion }, config.jwtSecret, {
        expiresIn: config.jwtExpiresIn
    });
};

module.exports = {
    authenticateToken,
    requireAdmin,
    generateToken,
    invalidateUserCache,
    invalidateAllUserCache,
    invalidateUserSessions
};
