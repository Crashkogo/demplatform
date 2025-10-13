// models/User.js (ОБНОВЛЕННАЯ ВЕРСИЯ)
const { DataTypes, Model } = require('sequelize');
const bcrypt = require('bcrypt');
const { sequelize } = require('../config/database');

class User extends Model {
    // Метод для проверки пароля
    async comparePassword(candidatePassword) {
        return bcrypt.compare(candidatePassword, this.password);
    }

    // Метод для получения безопасного объекта пользователя (без пароля)
    toSafeObject() {
        const user = this.toJSON();
        delete user.password;
        return user;
    }

    // Метод для проверки конкретного права
    async hasPermission(permission) {
        // Если есть roleData, проверяем через него
        if (this.roleData) {
            return this.roleData.hasPermission(permission);
        }

        // Если roleId указан, но roleData не загружена - загружаем
        if (this.roleId && !this.roleData) {
            const Role = require('./Role');
            const role = await Role.findByPk(this.roleId);
            if (role) {
                return role.hasPermission(permission);
            }
        }

        // По умолчанию нет прав
        return false;
    }

    // Метод для получения всех прав пользователя
    async getPermissions() {
        // Если есть roleData
        if (this.roleData) {
            return this.roleData.getPermissions();
        }

        // Если roleId указан, но roleData не загружена
        if (this.roleId && !this.roleData) {
            const Role = require('./Role');
            const role = await Role.findByPk(this.roleId);
            if (role) {
                return role.getPermissions();
            }
        }

        // По умолчанию нет прав
        return {
            canViewMaterials: false,
            canDownloadMaterials: false,
            canCreateMaterials: false,
            canEditMaterials: false,
            canDeleteMaterials: false,
            canCreateCategories: false,
            canEditCategories: false,
            canDeleteCategories: false,
            canManageAllCategories: false,
            categoryAccessType: 'selected',
            canViewUsers: false,
            canCreateUsers: false,
            canEditUsers: false,
            canDeleteUsers: false,
            canViewLogs: false,
            canManageRoles: false,
            isAdmin: false
        };
    }

    // Метод для получения доступных категорий пользователя
    async getAccessibleCategories() {
        // Если есть roleData
        if (this.roleData) {
            return await this.roleData.getAccessibleCategories();
        }

        // Если roleId указан, но roleData не загружена
        if (this.roleId && !this.roleData) {
            const Role = require('./Role');
            const role = await Role.findByPk(this.roleId);
            if (role) {
                return await role.getAccessibleCategories();
            }
        }

        // По умолчанию нет доступных категорий
        return [];
    }
}

User.init({
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    login: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
        validate: {
            len: [3, 50],
            notEmpty: true
        }
    },
    password: {
        type: DataTypes.STRING(255),
        allowNull: false,
        validate: {
            len: [6, 255]
        }
    },
    // Связь с таблицей ролей
    roleId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'role_id',
        references: {
            model: 'roles',
            key: 'id'
        }
    },
    lastLogin: {
        type: DataTypes.DATE,
        allowNull: true
    }
}, {
    sequelize,
    modelName: 'User',
    tableName: 'users',
    timestamps: true,
    underscored: true,
    hooks: {
        // Хэширование пароля перед сохранением
        beforeSave: async (user) => {
            if (user.changed('password')) {
                const salt = await bcrypt.genSalt(12);
                user.password = await bcrypt.hash(user.password, salt);
            }
        }
    }
});

module.exports = User;