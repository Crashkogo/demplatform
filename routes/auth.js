const express = require('express');
const { body, validationResult } = require('express-validator');
const { User } = require('../models');
const { generateToken, authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Валидаторы
const loginValidation = [
    body('login')
        .isLength({ min: 3, max: 50 })
        .withMessage('Логин должен содержать от 3 до 50 символов')
        .trim(),
    body('password')
        .isLength({ min: 6 })
        .withMessage('Пароль должен содержать минимум 6 символов')
];

// POST /api/auth/login - Вход в систему
router.post('/login', loginValidation, async (req, res) => {
    try {
        // Проверка валидации
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Ошибки валидации',
                errors: errors.array()
            });
        }

        const { login, password } = req.body;

        // Поиск пользователя
        const user = await User.findOne({ where: { login } });
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Неверный логин или пароль'
            });
        }

        // Проверка пароля
        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Неверный логин или пароль'
            });
        }

        // Обновление времени последнего входа
        user.lastLogin = new Date();
        await user.save();

        // Генерация токена
        const token = generateToken(user.id);

        res.json({
            success: true,
            message: 'Успешная авторизация',
            token,
            user: user.toSafeObject()
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Внутренняя ошибка сервера'
        });
    }
});

// GET /api/auth/me - Получение информации о текущем пользователе
router.get('/me', authenticateToken, async (req, res) => {
    try {
        res.json({
            success: true,
            user: req.user.toSafeObject()
        });
    } catch (error) {
        console.error('Get user info error:', error);
        res.status(500).json({
            success: false,
            message: 'Внутренняя ошибка сервера'
        });
    }
});

// POST /api/auth/logout - Выход из системы (в данной реализации просто возвращает успех)
router.post('/logout', authenticateToken, (req, res) => {
    res.json({
        success: true,
        message: 'Успешный выход из системы'
    });
});

// POST /api/auth/verify - Проверка действительности токена
router.post('/verify', authenticateToken, (req, res) => {
    res.json({
        success: true,
        message: 'Токен действителен',
        user: req.user.toSafeObject()
    });
});

module.exports = router; 