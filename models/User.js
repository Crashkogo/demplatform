// models/User.js
const { DataTypes, Model } = require('sequelize');
const bcrypt = require('bcrypt');
const { sequelize } = require('../config/database');

class User extends Model {
    async comparePassword(candidatePassword) {
        return bcrypt.compare(candidatePassword, this.password);
    }

    toSafeObject() {
        const user = this.toJSON();
        delete user.password;
        return user;
    }

    // Проверка конкретного права — true если хоть одна роль его даёт
    async hasPermission(permission) {
        const roles = await this._getRoles();
        return roles.some(r => r.isAdmin || r[permission] === true);
    }

    // Все права — OR-объединение всех ролей
    async getPermissions() {
        const roles = await this._getRoles();

        const empty = {
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
            canCreateArticles: false,
            canReadArticles: false,
            canGenerateProReview: false,
            isAdmin: false
        };

        if (roles.length === 0) return empty;

        return roles.reduce((acc, r) => {
            if (r.isAdmin) {
                // Администратор — все булевые флаги true
                Object.keys(acc).forEach(k => {
                    if (typeof acc[k] === 'boolean') acc[k] = true;
                });
                acc.categoryAccessType = 'all';
                return acc;
            }
            Object.keys(acc).forEach(k => {
                if (typeof acc[k] === 'boolean' && r[k] === true) acc[k] = true;
            });
            if (r.categoryAccessType === 'all') acc.categoryAccessType = 'all';
            return acc;
        }, empty);
    }

    // Доступные категории — объединение всех ролей
    async getAccessibleCategories() {
        const roles = await this._getRoles();

        for (const r of roles) {
            if (r.isAdmin || r.canManageAllCategories) {
                const Category = require('./Category');
                return await Category.findAll({ where: { isActive: true } });
            }
        }

        const map = new Map();
        for (const r of roles) {
            const cats = await r.getAccessibleCategories();
            cats.forEach(c => map.set(c.id, c));
        }
        return Array.from(map.values());
    }

    // Внутренний метод: возвращает массив ролей (из кэша ассоциации или БД)
    async _getRoles() {
        if (this.roles && Array.isArray(this.roles)) return this.roles;
        const Role = require('./Role');
        const roles = await Role.findAll({
            include: [{ association: 'allowedCategories', through: { attributes: [] } }],
            through: { model: 'user_roles', where: { user_id: this.id } }
        });
        this.roles = roles;
        return roles;
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
        beforeSave: async (user) => {
            if (user.changed('password')) {
                const salt = await bcrypt.genSalt(12);
                user.password = await bcrypt.hash(user.password, salt);
            }
        }
    }
});

module.exports = User;
