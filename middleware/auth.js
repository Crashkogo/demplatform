const jwt = require('jsonwebtoken');
const { User } = require('../models');
const config = require('../config');

// Middleware для проверки JWT токена
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Токен доступа не предоставлен'
            });
        }

        const decoded = jwt.verify(token, config.jwtSecret);
        const user = await User.findByPk(decoded.userId, {
            attributes: { exclude: ['password'] }
        });

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Пользователь не найден'
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

        console.error('Auth middleware error:', error);
        res.status(500).json({
            success: false,
            message: 'Внутренняя ошибка сервера'
        });
    }
};

// Middleware для проверки роли администратора
const requireAdmin = async (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Требуется аутентификация'
            });
        }

        if (!req.user.roleId) {
            return res.status(403).json({
                success: false,
                message: 'Роль не назначена'
            });
        }

        const { Role } = require('../models');
        const role = await Role.findByPk(req.user.roleId);

        if (!role) {
            return res.status(403).json({
                success: false,
                message: 'Роль не найдена'
            });
        }

        if (!role.isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Требуются права администратора'
            });
        }

        next();
    } catch (error) {
        console.error('requireAdmin middleware error:', error);
        return res.status(500).json({
            success: false,
            message: 'Ошибка проверки прав доступа'
        });
    }
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