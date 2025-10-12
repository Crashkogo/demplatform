// config/database.js
require('dotenv').config();  // Загружаем .env перед использованием process.env
const { Sequelize } = require('sequelize');

// Создаем соединение с PostgreSQL
const sequelize = new Sequelize({
    database: process.env.POSTGRES_DB || 'consultantplus',
    username: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres',
    host: process.env.POSTGRES_HOST || 'localhost',
    port: process.env.POSTGRES_PORT || 5432,
    dialect: 'postgres',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: {
        max: 10,
        min: 0,
        acquire: 30000,
        idle: 10000
    },
    define: {
        timestamps: true, // Автоматически добавляет createdAt и updatedAt
        underscored: false, // Использует camelCase для имен полей
        freezeTableName: true, // Не изменяет названия таблиц во множественное число
        charset: 'utf8',
        collate: 'utf8_general_ci'
    }
});

// Функция для проверки подключения к базе данных
const testConnection = async () => {
    try {
        await sequelize.authenticate();
        console.log('✅ Подключение к PostgreSQL установлено успешно');
        return true;
    } catch (error) {
        console.error('❌ Не удалось подключиться к PostgreSQL:', error);
        return false;
    }
};

// Функция для синхронизации моделей с базой данных
const syncDatabase = async (options = {}) => {
    try {
        const { force = false, alter = false } = options;
        await sequelize.sync({ force, alter });
        console.log('✅ Синхронизация базы данных завершена');
        return true;
    } catch (error) {
        console.error('❌ Ошибка синхронизации базы данных:', error);
        return false;
    }
};

module.exports = {
    sequelize,
    testConnection,
    syncDatabase
};