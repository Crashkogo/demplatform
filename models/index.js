// models/index.js (ПОЛНАЯ ВЕРСИЯ)
const { sequelize } = require('../config/database');
const User = require('./User');
const Category = require('./Category');
const Material = require('./Material');
const Role = require('./Role'); // ДОБАВИЛИ
const AuditEvent = require('./AuditEvent')(sequelize);

// === СВЯЗИ ДЛЯ MATERIAL ===
Material.belongsTo(Category, { 
    as: 'category', 
    foreignKey: 'categoryId' 
});

Material.belongsTo(User, { 
    as: 'uploader', 
    foreignKey: 'uploadedBy' 
});

Category.hasMany(Material, { 
    as: 'materials', 
    foreignKey: 'categoryId' 
});

User.hasMany(Material, { 
    as: 'uploadedMaterials', 
    foreignKey: 'uploadedBy' 
});

// === СВЯЗИ ДЛЯ ROLE (НОВОЕ) ===

// User -> Role (многие к одному)
User.belongsTo(Role, {
    foreignKey: 'roleId',
    as: 'roleData'
});

Role.hasMany(User, {
    foreignKey: 'roleId',
    as: 'users'
});

// Role <-> Category (многие ко многим)
Role.belongsToMany(Category, {
    through: 'role_categories',
    foreignKey: 'role_id',
    otherKey: 'category_id',
    as: 'allowedCategories'
});

Category.belongsToMany(Role, {
    through: 'role_categories',
    foreignKey: 'category_id',
    otherKey: 'role_id',
    as: 'roles'
});

// === СВЯЗИ ДЛЯ AUDITEVENT ===
AuditEvent.belongsTo(User, { foreignKey: 'userId' });
User.hasMany(AuditEvent, { foreignKey: 'userId' });

// Экспортируем модели и соединение
module.exports = {
    sequelize,
    User,
    Category,
    Material,
    Role, // ДОБАВИЛИ
    AuditEvent
};