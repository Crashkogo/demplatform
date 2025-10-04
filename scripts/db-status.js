/**
 * Скрипт для проверки статуса базы данных
 * Показывает информацию о подключении и существующих таблицах
 * 
 * Использование:
 * node scripts/db-status.js
 */

require('dotenv').config();
const { sequelize, User, Category, Material } = require('../models');

const checkStatus = async () => {
    try {
        console.log('🔍 Проверка статуса базы данных...\n');

        // Проверяем подключение
        console.log('🔗 Подключение к PostgreSQL...');
        await sequelize.authenticate();
        console.log('✅ Подключение установлено успешно\n');

        // Выводим информацию о подключении
        console.log('📊 Информация о подключении:');
        console.log(`   База данных: ${sequelize.config.database}`);
        console.log(`   Хост: ${sequelize.config.host}:${sequelize.config.port}`);
        console.log(`   Пользователь: ${sequelize.config.username}\n`);

        // Проверяем существование таблиц и считаем записи
        console.log('📋 Статус таблиц:\n');

        try {
            const userCount = await User.count();
            const adminCount = await User.count({ where: { role: 'admin' } });
            const clientCount = await User.count({ where: { role: 'client' } });
            console.log(`   ✅ users (пользователи):`);
            console.log(`      Всего: ${userCount}`);
            console.log(`      Администраторов: ${adminCount}`);
            console.log(`      Клиентов: ${clientCount}`);
        } catch (error) {
            console.log(`   ❌ users - таблица не существует`);
        }

        try {
            const categoryCount = await Category.count();
            const activeCount = await Category.count({ where: { isActive: true } });
            console.log(`\n   ✅ categories (категории):`);
            console.log(`      Всего: ${categoryCount}`);
            console.log(`      Активных: ${activeCount}`);
        } catch (error) {
            console.log(`\n   ❌ categories - таблица не существует`);
        }

        try {
            const materialCount = await Material.count();
            const activeCount = await Material.count({ where: { isActive: true } });
            const videoCount = await Material.count({ where: { fileType: 'video' } });
            const documentCount = await Material.count({ where: { fileType: 'document' } });
            const imageCount = await Material.count({ where: { fileType: 'image' } });
            console.log(`\n   ✅ materials (материалы):`);
            console.log(`      Всего: ${materialCount}`);
            console.log(`      Активных: ${activeCount}`);
            console.log(`      Видео: ${videoCount}`);
            console.log(`      Документов: ${documentCount}`);
            console.log(`      Изображений: ${imageCount}`);
        } catch (error) {
            console.log(`\n   ❌ materials - таблица не существует`);
        }

        console.log('\n✅ Проверка завершена!\n');

        process.exit(0);
    } catch (error) {
        console.error('❌ Ошибка проверки статуса:', error.message);
        console.error('\n📋 Детали ошибки:', error);
        console.log('\n💡 Возможные причины:');
        console.log('   - PostgreSQL не запущен');
        console.log('   - Неверные настройки подключения в .env');
        console.log('   - База данных не создана\n');
        process.exit(1);
    }
};

// Запускаем проверку
checkStatus();
