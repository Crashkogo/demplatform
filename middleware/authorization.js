const { Category } = require('../models');
const logger = require('../utils/logger');

// Вспомогательные функции для работы с массивом ролей
function getRoles(req) {
    return req.user?.roles || [];
}

function userIsAdmin(req) {
    return getRoles(req).some(r => r.isAdmin);
}

function userHasPermission(req, permission) {
    return getRoles(req).some(r => r.isAdmin || r[permission] === true);
}

function userCanManageAllCategories(req) {
    return getRoles(req).some(r => r.isAdmin || r.canManageAllCategories);
}

/**
 * Middleware для проверки прав доступа пользователя
 * @param {string} requiredPermission - Требуемое право (например, 'canViewMaterials')
 */
const checkAccess = (requiredPermission) => {
    return async (req, res, next) => {
        try {
            const roles = getRoles(req);

            if (roles.length === 0) {
                return res.status(403).json({ success: false, message: 'Доступ запрещен: роли не назначены' });
            }

            // Администратор имеет все права
            if (userIsAdmin(req)) {
                return next();
            }

            // Проверяем наличие требуемого права хотя бы в одной роли
            if (!userHasPermission(req, requiredPermission)) {
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

            if (!categoryPermissions.includes(requiredPermission)) {
                return next();
            }

            // Если хоть одна роль даёт полный доступ ко всем категориям
            if (userCanManageAllCategories(req)) {
                return next();
            }

            // Определяем ID категории для проверки
            let categoryIdToCheck = req.params.id || req.params.categoryId || req.body.categoryId || req.body.parentId;

            if (requiredPermission === 'canCreateCategories') {
                if (!categoryIdToCheck) {
                    return res.status(403).json({
                        success: false,
                        message: 'Доступ запрещен: только администратор может создавать корневые категории'
                    });
                }
            }

            if (!categoryIdToCheck) {
                if (requiredPermission === 'canViewMaterials') {
                    return next();
                }
                return res.status(400).json({
                    success: false,
                    message: 'ID категории для проверки доступа не указан'
                });
            }

            categoryIdToCheck = parseInt(categoryIdToCheck);

            // Проверяем доступ к категории хотя бы через одну роль
            const results = await Promise.all(
                roles.map(r => r.hasCategoryAccess(categoryIdToCheck))
            );
            const hasAccess = results.some(Boolean);

            if (!hasAccess) {
                return res.status(403).json({
                    success: false,
                    message: 'Доступ к данной категории запрещен'
                });
            }

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
 */
const addAccessibleCategories = async (req, res, next) => {
    try {
        const roles = getRoles(req);

        if (roles.length === 0) {
            req.accessibleCategories = [];
            return next();
        }

        logger.debug('Проверка доступа, ролей:', roles.map(r => r.name).join(', '));

        if (userIsAdmin(req) || userCanManageAllCategories(req)) {
            logger.debug('Полный доступ ко всем категориям');
            req.accessibleCategories = 'all';
            return next();
        }

        // Объединяем категории всех ролей
        const map = new Map();
        for (const role of roles) {
            const cats = await role.getAccessibleCategories();
            cats.forEach(c => map.set(c.id, c));
        }

        req.accessibleCategories = Array.from(map.keys());
        logger.debug('Доступные категории:', req.accessibleCategories);

        next();
    } catch (error) {
        logger.error('Error adding accessible categories:', error);
        res.status(500).json({ success: false, message: 'Ошибка получения доступных категорий' });
    }
};

module.exports = { checkAccess, addAccessibleCategories, getRoles, userIsAdmin, userHasPermission };
