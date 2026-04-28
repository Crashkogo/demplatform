const jwt = require('jsonwebtoken');
const { User } = require('../models');
const config = require('../config');
const logger = require('../utils/logger');

// Middleware для проверки JWT токена
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

        if (!token) {
            logger.warn('Токен не предоставлен для:', req.method, req.originalUrl);
            return res.status(401).json({
                success: false,
                message: 'Токен доступа не предоставлен'
            });
        }

        const decoded = jwt.verify(token, config.jwtSecret);
        logger.debug('Токен верифицирован для пользователя ID:', decoded.userId);

        // Загружаем пользователя с ролью
        const { Role } = require('../models');
        const user = await User.findByPk(decoded.userId, {
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
    generateToken
}; 