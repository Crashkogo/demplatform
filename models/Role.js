// models/Role.js
const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

class Role extends Model {
    // Метод проверки конкретного права
    hasPermission(permission) {
        // Администратор имеет все права
        if (this.isAdmin) return true;

        // Проверяем конкретное право
        return this[permission] === true;
    }

    // Проверка доступа к конкретной категории с учетом каскадности
    async hasCategoryAccess(categoryId) {
        // Администратор имеет доступ ко всем категориям
        if (this.isAdmin) return true;

        // Если есть полный доступ ко всем категориям
        if (this.canManageAllCategories) return true;

        // Загружаем разрешенные категории, если не загружены
        if (!this.allowedCategories) {
            const Category = require('./Category');
            await this.reload({ include: [{ model: Category, as: 'allowedCategories' }] });
        }

        // Если нет разрешенных категорий, доступа нет
        if (!this.allowedCategories || this.allowedCategories.length === 0) {
            return false;
        }

        // Получаем ID разрешенных категорий
        const allowedCategoryIds = new Set(this.allowedCategories.map(c => c.id));

        // Проверяем прямое совпадение
        if (allowedCategoryIds.has(categoryId)) {
            return true;
        }

        // Получаем целевую категорию для проверки родителей
        const Category = require('./Category');
        const targetCategory = await Category.findByPk(categoryId);

        if (!targetCategory || !targetCategory.path) {
            return false;
        }

        // Проверяем, есть ли доступ к родительским категориям (каскадный доступ)
        const parentIds = targetCategory.path.split('/').filter(Boolean).map(Number);
        for (const parentId of parentIds) {
            if (allowedCategoryIds.has(parentId)) {
                return true;
            }
        }

        return false;
    }

    // Получение всех доступных категорий (включая дочерние через каскадность)
    async getAccessibleCategories() {
        // Администратор имеет доступ ко всем категориям
        if (this.isAdmin || this.canManageAllCategories) {
            const Category = require('./Category');
            return await Category.findAll({ where: { isActive: true } });
        }

        // Загружаем разрешенные категории, если не загружены
        if (!this.allowedCategories) {
            const Category = require('./Category');
            await this.reload({ include: [{ model: Category, as: 'allowedCategories' }] });
        }

        if (!this.allowedCategories || this.allowedCategories.length === 0) {
            return [];
        }

        const Category = require('./Category');
        const { Op } = require('sequelize');

        // Собираем все разрешенные категории и их потомков
        const accessibleCategories = new Map();

        for (const allowedCategory of this.allowedCategories) {
            // Добавляем саму категорию
            accessibleCategories.set(allowedCategory.id, allowedCategory);

            // Получаем всех потомков этой категории (каскадно)
            const descendants = await Category.findAll({
                where: {
                    path: {
                        [Op.like]: `${allowedCategory.path}/%`
                    },
                    isActive: true
                }
            });

            // Добавляем всех потомков
            descendants.forEach(cat => {
                accessibleCategories.set(cat.id, cat);
            });
        }

        return Array.from(accessibleCategories.values());
    }

    // Метод получения всех прав в виде объекта
    getPermissions() {
        return {
            // Материалы
            canViewMaterials: this.canViewMaterials,
            canDownloadMaterials: this.canDownloadMaterials,
            canCreateMaterials: this.canCreateMaterials,
            canEditMaterials: this.canEditMaterials,
            canDeleteMaterials: this.canDeleteMaterials,

            // Категории
            canCreateCategories: this.canCreateCategories,
            canEditCategories: this.canEditCategories,
            canDeleteCategories: this.canDeleteCategories,
            canManageAllCategories: this.canManageAllCategories,
            categoryAccessType: this.categoryAccessType,

            // Пользователи
            canViewUsers: this.canViewUsers,
            canCreateUsers: this.canCreateUsers,
            canEditUsers: this.canEditUsers,
            canDeleteUsers: this.canDeleteUsers,

            // Логи
            canViewLogs: this.canViewLogs,

            // Роли
            canManageRoles: this.canManageRoles,

            // Общее
            isAdmin: this.isAdmin
        };
    }

    // Безопасный объект для отправки клиенту
    toSafeObject() {
        const role = this.toJSON();
        return role;
    }
}

Role.init({
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
        validate: {
            notEmpty: true,
            len: [1, 100]
        }
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    isAdmin: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'is_admin'
    },

    // === ПРАВА НА МАТЕРИАЛЫ ===
    canViewMaterials: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        field: 'can_view_materials'
    },
    canDownloadMaterials: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'can_download_materials'
    },
    canCreateMaterials: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'can_create_materials'
    },
    canEditMaterials: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'can_edit_materials'
    },
    canDeleteMaterials: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'can_delete_materials'
    },

    // === ПРАВА НА КАТЕГОРИИ ===
    canCreateCategories: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'can_create_categories'
    },
    canEditCategories: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'can_edit_categories'
    },
    canDeleteCategories: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'can_delete_categories'
    },
    canManageAllCategories: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'can_manage_all_categories',
        comment: 'Полный доступ ко всем категориям'
    },
    categoryAccessType: {
        type: DataTypes.ENUM('all', 'selected'),
        defaultValue: 'selected',
        field: 'category_access_type'
    },

    // === ПРАВА НА ПОЛЬЗОВАТЕЛЕЙ ===
    canViewUsers: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'can_view_users'
    },
    canCreateUsers: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'can_create_users'
    },
    canEditUsers: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'can_edit_users'
    },
    canDeleteUsers: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'can_delete_users'
    },

    // === ПРАВА НА ЛОГИ ===
    canViewLogs: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'can_view_logs'
    },

    // === ПРАВА НА РОЛИ ===
    canManageRoles: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'can_manage_roles'
    }
}, {
    sequelize,
    modelName: 'Role',
    tableName: 'roles',
    timestamps: true,
    underscored: true,
    indexes: [
        {
            unique: true,
            fields: ['name']
        },
        {
            fields: ['is_admin']
        }
    ]
});

module.exports = Role;