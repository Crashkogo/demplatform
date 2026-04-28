const express = require('express');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const { User, Role } = require('../models');
const { generateToken, authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Ограничение: не более 10 попыток входа за 15 минут с одного IP
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Слишком много попыток входа. Попробуйте через 15 минут.'
    }
});

// Хелпер: формирует объект пользователя с ролью для ответа клиенту
function buildUserWithRole(userObject, roleData) {
    return {
        ...userObject,
        Role: {
            id: roleData.id,
            name: roleData.name,
            description: roleData.description,
            isAdmin: roleData.isAdmin,
            canViewMaterials: roleData.canViewMaterials,
            canDownloadMaterials: roleData.canDownloadMaterials,
            canCreateMaterials: roleData.canCreateMaterials,
            canEditMaterials: roleData.canEditMaterials,
            canDeleteMaterials: roleData.canDeleteMaterials,
            canCreateCategories: roleData.canCreateCategories,
            canEditCategories: roleData.canEditCategories,
            canDeleteCategories: roleData.canDeleteCategories,
            canManageAllCategories: roleData.canManageAllCategories,
            canViewUsers: roleData.canViewUsers,
            canCreateUsers: roleData.canCreateUsers,
            canEditUsers: roleData.canEditUsers,
            canDeleteUsers: roleData.canDeleteUsers,
            canManageRoles: roleData.canManageRoles,
            canViewLogs: roleData.canViewLogs,
            allowedCategories: roleData.allowedCategories || []
        }
    };
}

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
router.post('/login', loginLimiter, loginValidation, async (req, res) => {
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

        // Поиск пользователя с ролью
        console.log('🔍 Ищем пользователя:', login);
        const user = await User.findOne({
            where: { login },
            include: [{ model: Role, as: 'roleData' }]
        });

        console.log('🔍 Пользователь найден:', !!user);
        if (user) {
            console.log('🔍 roleData присутствует:', !!user.roleData);
            console.log('🔍 roleId:', user.roleId);
        }

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

        // Проверка наличия роли
        if (!user.roleData) {
            console.error('❌ Роль не загружена для пользователя:', user.login);
            return res.status(403).json({
                success: false,
                message: 'Роль пользователя не найдена. Обратитесь к администратору.'
            });
        }

        console.log('✅ Роль загружена:', user.roleData.name);

        // Обновление времени последнего входа
        user.lastLogin = new Date();
        await user.save();

        // Генерация токена
        const token = generateToken(user.id);

        // Получаем права пользователя
        const permissions = user.roleData.getPermissions();
        console.log('✅ Права получены:', Object.keys(permissions).length);

        // Получаем доступные категории (только ID для оптимизации)
        const accessibleCategories = await user.getAccessibleCategories();
        const accessibleCategoryIds = accessibleCategories.map(cat => cat.id);
        console.log('✅ Категории получены:', accessibleCategoryIds.length);

        const userObject = user.toSafeObject();
        const userWithRole = buildUserWithRole(userObject, user.roleData);

        const response = {
            success: true,
            message: 'Успешная авторизация',
            token,
            user: userWithRole,
            permissions,
            accessibleCategoryIds
        };

        console.log('📤 Отправляем ответ логина для пользователя:', {
            login: userWithRole.login,
            roleName: userWithRole.Role.name,
            isAdmin: userWithRole.Role.isAdmin
        });

        res.json(response);

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
        const userObject = req.user.toSafeObject();
        const userWithRole = buildUserWithRole(userObject, req.user.roleData);

        console.log('📤 /api/auth/me - Отправляем пользователя:', {
            login: userWithRole.login,
            roleName: userWithRole.Role.name,
            isAdmin: userWithRole.Role.isAdmin
        });

        res.json({
            success: true,
            user: userWithRole
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