// models/index.js (ПОЛНАЯ ВЕРСИЯ)
const { sequelize } = require('../config/database');
const User = require('./User');
const Category = require('./Category');
const Material = require('./Material');
const Role = require('./Role');
const AuditEvent = require('./AuditEvent')(sequelize);
const Article = require('./Article');
const ArticleSection = require('./ArticleSection');
const HeaderImage = require('./HeaderImage');
const Organization = require('./Organization');

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

// === СВЯЗИ ДЛЯ ROLE ===

// User <-> Role (многие ко многим через user_roles)
User.belongsToMany(Role, {
    through: 'user_roles',
    foreignKey: 'user_id',
    otherKey: 'role_id',
    as: 'roles',
    timestamps: false
});

Role.belongsToMany(User, {
    through: 'user_roles',
    foreignKey: 'role_id',
    otherKey: 'user_id',
    as: 'users',
    timestamps: false
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

// === СВЯЗИ ДЛЯ ORGANIZATION ===
Organization.hasMany(User, { foreignKey: 'organizationId', as: 'members' });
User.belongsTo(Organization, { foreignKey: 'organizationId', as: 'organization' });

Organization.hasMany(Role, { foreignKey: 'organizationId', as: 'orgRoles' });
Role.belongsTo(Organization, { foreignKey: 'organizationId', as: 'organization' });

// === СВЯЗИ ДЛЯ ARTICLE ===
Article.belongsTo(User, { as: 'author', foreignKey: 'authorId' });
User.hasMany(Article, { as: 'articles', foreignKey: 'authorId' });

Article.belongsToMany(ArticleSection, {
    through: 'article_section_assignments',
    foreignKey: 'article_id',
    otherKey: 'section_id',
    as: 'sections'
});

ArticleSection.belongsToMany(Article, {
    through: 'article_section_assignments',
    foreignKey: 'section_id',
    otherKey: 'article_id',
    as: 'articles'
});

HeaderImage.belongsTo(User, { as: 'uploader', foreignKey: 'uploadedBy' });

// Экспортируем модели и соединение
module.exports = {
    sequelize,
    User,
    Category,
    Material,
    Role,
    AuditEvent,
    Article,
    ArticleSection,
    HeaderImage,
    Organization
};