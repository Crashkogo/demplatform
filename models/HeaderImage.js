const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

class HeaderImage extends Model {}

HeaderImage.init({
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    filename: {
        type: DataTypes.STRING(500),
        allowNull: false
    },
    originalName: {
        type: DataTypes.STRING(500),
        allowNull: true,
        field: 'original_name'
    },
    path: {
        type: DataTypes.STRING(1000),
        allowNull: false
    },
    mimeType: {
        type: DataTypes.STRING(100),
        allowNull: true,
        field: 'mime_type'
    },
    size: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    uploadedBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'uploaded_by'
    }
}, {
    sequelize,
    modelName: 'HeaderImage',
    tableName: 'header_images',
    timestamps: true,
    underscored: true
});

module.exports = HeaderImage;
