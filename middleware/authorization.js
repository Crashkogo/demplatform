const { Category } = require('../models');
const logger = require('../utils/logger');

/**
 * Middleware для проверки прав доступа пользователя
 * @param {string} requiredPermission - Требуемое право (например, 'canViewMaterials')
 */
const checkAccess = (requiredPermission) => {
    return async (req, res, next) => {
        try {
            // Используем данные роли, уже загруженные authenticateToken
            const role = req.user.roleData;

            // Проверка наличия роли
            if (!role) {
                return res.status(403).json({ success: false, message: 'Доступ запрещен: роль не назначена' });
            }

            // Администратор имеет все права
            if (role.isAdmin) {
                return next();
            }

            // Проверяем наличие требуемого права
            if (!role[requiredPermission]) {
                return res.status(403).json({
                    success: false,
                    message: 'Доступ запрещен: недостаточно прав'
                });
            }

            // Определяем, требуется ли проверка доступа к категориям
            const categoryPermissions = [
                'canCreateMaterials', 'canEditMaterials', 'canDeleteMaterials',
                'canCreateCategories', 'canEditCategories', 'canDeleteCategories',
                'canViewMaterials'
            ];

            // Если право не связано с категориями, разрешаем доступ
            if (!categoryPermissions.includes(requiredPermission)) {
                return next();
            }

            // Если есть полный доступ ко всем категориям
            if (role.canManageAllCategories) {
                return next();
            }

            // Определяем ID категории для проверки
            let categoryIdToCheck = req.params.id || req.params.categoryId || req.body.categoryId || req.body.parentId;

            // Для создания категории
            if (requiredPermission === 'canCreateCategories') {
                if (!categoryIdToCheck) {
                    // Создание корневой категории разрешено только администратору
                    return res.status(403).json({
                        success: false,
                        message: 'Доступ запрещен: только администратор может создавать корневые категории'
                    });
                }
            }

            // Если ID категории не указан, запрещаем доступ
            if (!categoryIdToCheck) {
                // Для просмотра материалов без указания категории - разрешаем (будет фильтрация на уровне запроса)
                if (requiredPermission === 'canViewMaterials') {
                    return next();
                }
                return res.status(400).json({
                    success: false,
                    message: 'ID категории для проверки доступа не указан'
                });
            }

            // Преобразуем в число
            categoryIdToCheck = parseInt(categoryIdToCheck);

            // Проверяем доступ к категории с использованием метода модели
            const hasAccess = await role.hasCategoryAccess(categoryIdToCheck);

            if (!hasAccess) {
                return res.status(403).json({
                    success: false,
                    message: 'Доступ к данной категории запрещен'
                });
            }

            // Доступ разрешен
            next();

        } catch (error) {
            logger.error('Authorization error:', error);
            res.status(500).json({
                success: false,
                message: 'Ошибка проверки прав доступа'
            });
        }
    };
};

/**
 * Middleware для добавления доступных категорий в запрос
 * Используется для фильтрации данных по доступным категориям
 */
const addAccessibleCategories = async (req, res, next) => {
    try {
        // Используем данные роли, уже загруженные authenticateToken
        const role = req.user.roleData;

        if (!role) {
            logger.error('Роль не найдена для пользователя:', req.user.login);
            req.accessibleCategories = [];
            return next();
        }

        logger.debug('Проверка доступа для роли:', role.name, '| isAdmin:', role.isAdmin, '| canManageAllCategories:', role.canManageAllCategories);

        // Администратор или полный доступ
        if (role.isAdmin || role.canManageAllCategories) {
            logger.debug('Полный доступ ко всем категориям');
            req.accessibleCategories = 'all';
            return next();
        }

        // Получаем доступные категории
        const accessibleCategories = await role.getAccessibleCategories();
        req.accessibleCategories = accessibleCategories.map(cat => cat.id);
        logger.debug('Доступные категории:', req.accessibleCategories);

        next();
    } catch (error) {
        logger.error('Error adding accessible categories:', error);
        res.status(500).json({ success: false, message: 'Ошибка получения доступных категорий' });
    }
};

module.exports = { checkAccess, addAccessibleCategories };