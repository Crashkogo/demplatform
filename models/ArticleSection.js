const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

class ArticleSection extends Model {}

ArticleSection.init({
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    name: {
        type: DataTypes.STRING(200),
        allowNull: false,
        validate: { notEmpty: true, len: [1, 200] }
    }
}, {
    sequelize,
    modelName: 'ArticleSection',
    tableName: 'article_sections',
    timestamps: true,
    underscored: true
});

module.exports = ArticleSection;
