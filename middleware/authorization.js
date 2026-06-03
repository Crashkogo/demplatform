const { Category } = require('../models');
const logger = require('../utils/logger');

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
 * Ключевая проверка: конкретная роль даёт и право, и доступ к категории.
 * Только так можно корректно разграничить права при множественных ролях.
 */
async function canRoleActOnCategory(role, permission, categoryId) {
    if (role.isAdmin || role.canManageAllCategories) return true;
    if (!role[permission]) return false;
    return await role.hasCategoryAccess(categoryId);
}

/**
 * Хотя бы одна из ролей пользователя даёт право + доступ к категории одновременно.
 */
async function canUserActOnCategory(roles, permission, categoryId) {
    for (const role of roles) {
        if (await canRoleActOnCategory(role, permission, categoryId)) return true;
    }
    return false;
}

/**
 * Middleware для проверки прав доступа пользователя.
 * Для операций с категориями проверяет право + категорию через одну роль.
 */
const checkAccess = (requiredPermission) => {
    return async (req, res, next) => {
        try {
            const roles = getRoles(req);

            if (roles.length === 0) {
                return res.status(403).json({ success: false, message: 'Доступ запрещен: роли не назначены' });
            }

            if (userIsAdmin(req)) return next();

            const categoryPermissions = [
                'canCreateMaterials', 'canEditMaterials', 'canDeleteMaterials',
                'canCreateCategories', 'canEditCategories', 'canDeleteCategories',
                'canViewMaterials'
            ];

            // Права без привязки к категориям — проверяем просто наличие права
            if (!categoryPermissions.includes(requiredPermission)) {
                if (!userHasPermission(req, requiredPermission)) {
                    return res.status(403).json({ success: false, message: 'Доступ запрещен: недостаточно прав' });
                }
                return next();
            }

            // Определяем категорию для проверки
            let categoryIdToCheck = req.params.id || req.params.categoryId || req.body.categoryId || req.body.parentId;

            if (requiredPermission === 'canCreateCategories' && !categoryIdToCheck) {
                return res.status(403).json({
                    success: false,
                    message: 'Доступ запрещен: только администратор может создавать корневые категории'
                });
            }

            if (!categoryIdToCheck) {
                // Без конкретной категории — достаточно наличия права
                if (requiredPermission === 'canViewMaterials') return next();
                return res.status(400).json({ success: false, message: 'ID категории для проверки доступа не указан' });
            }

            categoryIdToCheck = parseInt(categoryIdToCheck);

            // Проверяем: та же роль даёт и право, и доступ к категории
            const hasAccess = await canUserActOnCategory(roles, requiredPermission, categoryIdToCheck);
            if (!hasAccess) {
                return res.status(403).json({ success: false, message: 'Доступ к данной категории запрещен' });
            }

            next();
        } catch (error) {
            logger.error('Authorization error:', error);
            res.status(500).json({ success: false, message: 'Ошибка проверки прав доступа' });
        }
    };
};

/**
 * Middleware для добавления доступных категорий в запрос.
 * Категория попадает в список только если есть роль с canViewMaterials + доступом к ней.
 */
const addAccessibleCategories = async (req, res, next) => {
    try {
        const roles = getRoles(req);

        if (roles.length === 0) {
            req.accessibleCategories = [];
            return next();
        }

        if (userIsAdmin(req) || userCanManageAllCategories(req)) {
            req.accessibleCategories = 'all';
            return next();
        }

        // Объединяем категории только тех ролей, у которых есть право просмотра материалов
        const map = new Map();
        for (const role of roles) {
            // Роль должна иметь хотя бы одно из прав на работу с материалами
            const hasAnyMaterialPermission = role.canViewMaterials || role.canCreateMaterials ||
                role.canEditMaterials || role.canDeleteMaterials || role.canDownloadMaterials;
            if (!hasAnyMaterialPermission) continue;

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

module.exports = {
    checkAccess,
    addAccessibleCategories,
    getRoles,
    userIsAdmin,
    userHasPermission,
    canUserActOnCategory
};
