const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

class Category extends Model {
    // Статический метод для получения дерева категорий
    static async getTree() {
        const categories = await this.findAll({
            where: { isActive: true },
            order: [['level', 'ASC'], ['order', 'ASC'], ['name', 'ASC']]
        });

        const categoryMap = {};
        const tree = [];

        // Создаем карту всех категорий
        categories.forEach(cat => {
            const categoryData = cat.toJSON();
            categoryMap[categoryData.id] = { ...categoryData, children: [] };
        });

        // Строим дерево
        categories.forEach(cat => {
            const categoryData = cat.toJSON();
            const parentId = categoryData.parentId;

            if (parentId && categoryMap[parentId]) {
                categoryMap[parentId].children.push(categoryMap[categoryData.id]);
            } else {
                tree.push(categoryMap[categoryData.id]);
            }
        });

        return tree;
    }

    // Статический метод для получения всех потомков категории
    static async getDescendants(categoryId) {
        const category = await this.findByPk(categoryId);
        if (!category) return [];

        const descendants = await this.findAll({
            where: {
                path: {
                    [sequelize.Sequelize.Op.like]: `${category.path}/%`
                }
            }
        });

        return descendants;
    }
}

Category.init({
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        validate: {
            notEmpty: true,
            len: [1, 100]
        }
    },
    parentId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
            model: 'categories',
            key: 'id'
        }
    },
    path: {
        type: DataTypes.STRING(500),
        allowNull: true
    },
    level: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    order: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true,
        validate: {
            len: [0, 500]
        }
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    accessRoles: {
        type: DataTypes.JSON,
        defaultValue: ['client']
    }
}, {
    sequelize,
    modelName: 'Category',
    tableName: 'categories',
    timestamps: true,
    indexes: [
        {
            fields: ['parentId', 'order']
        },
        {
            fields: ['path']
        },
        {
            fields: ['name']
        },
        {
            fields: ['isActive']
        }
    ],
    hooks: {
        beforeSave: async (category) => {
            // Для новых категорий устанавливаем уровень
            if (category.isNewRecord) {
                if (category.parentId) {
                    const parent = await Category.findByPk(category.parentId);
                    if (parent) {
                        category.level = parent.level + 1;
                    } else {
                        category.level = 0;
                    }
                } else {
                    category.level = 0;
                }
            } else if (category.changed('parentId')) {
                // Для существующих категорий при изменении родителя
                if (category.parentId) {
                    const parent = await Category.findByPk(category.parentId);
                    if (parent) {
                        category.path = `${parent.path}/${category.id}`;
                        category.level = parent.level + 1;
                    } else {
                        category.path = `/${category.id}`;
                        category.level = 0;
                    }
                } else {
                    category.path = `/${category.id}`;
                    category.level = 0;
                }
            }
        },
        afterSave: async (category) => {
            // Устанавливаем путь после получения id
            if (category.isNewRecord || !category.path) {
                let newPath;
                if (category.parentId) {
                    const parent = await Category.findByPk(category.parentId);
                    if (parent) {
                        newPath = `${parent.path}/${category.id}`;
                    } else {
                        newPath = `/${category.id}`;
                    }
                } else {
                    newPath = `/${category.id}`;
                }

                // Обновляем путь в базе данных
                await Category.update(
                    { path: newPath },
                    { where: { id: category.id } }
                );

                // Обновляем текущий объект
                category.path = newPath;
            }
        }
    }
});

// Определяем связи
Category.belongsTo(Category, { 
    as: 'parent', 
    foreignKey: 'parentId' 
});

Category.hasMany(Category, { 
    as: 'children', 
    foreignKey: 'parentId' 
});

module.exports = Category;