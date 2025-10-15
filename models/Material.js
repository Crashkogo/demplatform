const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

class Material extends Model {
    // Виртуальное поле для определения типа файла на основе MIME-типа
    get displayType() {
        const mimeType = this.mimeType;

        if (mimeType.startsWith('video/')) {
            return 'video';
        } else if (mimeType.startsWith('image/')) {
            return 'image';
        } else if (
            mimeType.includes('document') ||
            mimeType.includes('pdf') ||
            mimeType.includes('word') ||
            mimeType.includes('excel') ||
            mimeType.includes('spreadsheet') ||
            mimeType.includes('presentation') ||
            mimeType.includes('odt') ||
            mimeType.includes('ods') ||
            mimeType.includes('odp')
        ) {
            return 'document';
        } else {
            return 'other';
        }
    }

    // Статический метод для поиска материалов
    static async search(query, options = {}) {
        const {
            categoryId,
            fileType,
            limit = 50,
            offset = 0,
            accessibleCategoryIds // Новый параметр для фильтрации по доступным категориям
        } = options;

        const whereClause = {
            isActive: true
        };

        let finalCategoryIds = accessibleCategoryIds;

        // Если пользователь указал конкретную категорию для фильтрации
        if (categoryId) {
            const requestedCategoryId = parseInt(categoryId, 10);

            // Если у пользователя есть ограничения по категориям
            if (finalCategoryIds && Array.isArray(finalCategoryIds)) {
                // Проверяем, есть ли у него доступ к запрашиваемой категории
                if (finalCategoryIds.includes(requestedCategoryId)) {
                    // Если да, то ищем только в этой категории
                    finalCategoryIds = [requestedCategoryId];
                } else {
                    // Если нет, возвращаем пустой результат, так как это попытка доступа к запрещенной категории
                    return { materials: [], total: 0, hasMore: false };
                }
            } else {
                // Если ограничений нет (админ), просто используем запрошенную категорию
                finalCategoryIds = [requestedCategoryId];
            }
        }

        // Применяем итоговый фильтр по категориям
        if (finalCategoryIds && Array.isArray(finalCategoryIds) && finalCategoryIds.length > 0) {
            whereClause.categoryId = {
                [sequelize.Sequelize.Op.in]: finalCategoryIds
            };
        }

        if (fileType) {
            whereClause.fileType = fileType;
        }

        if (query) {
            whereClause[sequelize.Sequelize.Op.or] = [
                {
                    title: {
                        [sequelize.Sequelize.Op.iLike]: `%${query}%`
                    }
                },
                {
                    description: {
                        [sequelize.Sequelize.Op.iLike]: `%${query}%`
                    }
                },
                {
                    tags: {
                        [sequelize.Sequelize.Op.contains]: [query]
                    }
                }
            ];
        }

        const result = await this.findAndCountAll({
            where: whereClause,
            include: [
                {
                    model: sequelize.models.Category,
                    as: 'category',
                    attributes: ['id', 'name', 'path']
                },
                {
                    model: sequelize.models.User,
                    as: 'uploader',
                    attributes: ['id', 'login']
                }
            ],
            order: [['createdAt', 'DESC']],
            limit,
            offset
        });

        return {
            materials: result.rows,
            total: result.count,
            hasMore: result.count > offset + result.rows.length
        };
    }

    // Метод для увеличения счетчика просмотров
    async incrementView() {
        await this.increment('viewCount');
    }

    // Метод для увеличения счетчика скачиваний
    async incrementDownload() {
        await this.increment('downloadCount');
    }
}

Material.init({
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    title: {
        type: DataTypes.STRING(200),
        allowNull: false,
        validate: {
            notEmpty: true,
            len: [1, 200]
        }
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true,
        validate: {
            len: [0, 1000]
        }
    },
    filename: {
        type: DataTypes.STRING(255),
        allowNull: false
    },
    originalName: {
        type: DataTypes.STRING(255),
        allowNull: false
    },
    filePath: {
        type: DataTypes.STRING(500),
        allowNull: false
    },
    fileSize: {
        type: DataTypes.BIGINT,
        allowNull: false
    },
    mimeType: {
        type: DataTypes.STRING(100),
        allowNull: false
    },
    fileType: {
        type: DataTypes.ENUM('video', 'image', 'document', 'other'),
        allowNull: false
    },
    categoryId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'categories',
            key: 'id'
        }
    },
    uploadedBy: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'users',
            key: 'id'
        }
    },
    downloadCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    viewCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    tags: {
        type: DataTypes.JSON,
        defaultValue: []
    }
}, {
    sequelize,
    modelName: 'Material',
    tableName: 'materials',
    timestamps: true,
    indexes: [
        {
            fields: ['categoryId', 'isActive']
        },
        {
            fields: ['fileType']
        },
        {
            fields: ['isActive', 'categoryId', 'createdAt']
        },
        {
            fields: ['isActive', 'fileType', 'createdAt']
        },
        {
            fields: ['isActive', 'categoryId', 'fileType', 'createdAt']
        },
        {
            fields: ['title']
        }
    ],
    hooks: {
        beforeSave: (material) => {
            // Определяем тип файла перед сохранением
            if (material.isNewRecord || material.changed('mimeType')) {
                material.fileType = material.displayType;
            }
        }
    }
});

module.exports = Material;