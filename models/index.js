const { sequelize } = require('../config/database');
const User = require('./User');
const Category = require('./Category');
const Material = require('./Material');

// Определяем связи между моделями

// Связи для Category (уже определены в модели Category)
// Category.belongsTo(Category, { as: 'parent', foreignKey: 'parentId' });
// Category.hasMany(Category, { as: 'children', foreignKey: 'parentId' });

// Связи для Material
Material.belongsTo(Category, { 
    as: 'category', 
    foreignKey: 'categoryId' 
});

Material.belongsTo(User, { 
    as: 'uploader', 
    foreignKey: 'uploadedBy' 
});

// Обратные связи
Category.hasMany(Material, { 
    as: 'materials', 
    foreignKey: 'categoryId' 
});

User.hasMany(Material, { 
    as: 'uploadedMaterials', 
    foreignKey: 'uploadedBy' 
});

// Экспортируем модели и соединение
module.exports = {
    sequelize,
    User,
    Category,
    Material
};
