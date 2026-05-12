const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

class Article extends Model {}

Article.init({
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    title: {
        type: DataTypes.STRING(500),
        allowNull: false,
        validate: { notEmpty: true }
    },
    content: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: ''
    },
    authorId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'author_id'
    }
}, {
    sequelize,
    modelName: 'Article',
    tableName: 'articles',
    timestamps: true,
    underscored: true
});

module.exports = Article;
