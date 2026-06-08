const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

class ArticleSubsection extends Model {}

ArticleSubsection.init({
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    name: {
        type: DataTypes.STRING(200),
        allowNull: false,
        validate: { notEmpty: true, len: [1, 200] }
    },
    sortOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: 'sort_order'
    }
}, {
    sequelize,
    modelName: 'ArticleSubsection',
    tableName: 'article_subsections',
    timestamps: true,
    underscored: true
});

module.exports = ArticleSubsection;
