// models/Organization.js
const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

class Organization extends Model {}

Organization.init({
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
        validate: { notEmpty: true, len: [1, 100] }
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true
    }
}, {
    sequelize,
    modelName: 'Organization',
    tableName: 'organizations',
    timestamps: true,
    underscored: true
});

module.exports = Organization;
