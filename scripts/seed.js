/**
 * Скрипт для заполнения базы данных начальными данными
 * Создает администратора и базовые категории
 * 
 * Использование:
 * node scripts/seed.js
 */

require('dotenv').config();
const { sequelize, User, Category, Material } = require('../models');

const seed = async () => {
    try {
        console.log('🌱 Начало заполнения базы данных начальными данными...\n');

        // Проверяем подключение
        console.log('🔗 Проверка подключения к PostgreSQL...');
        await sequelize.authenticate();
        console.log('✅ Подключение установлено\n');

        // Создаем администратора по умолчанию
        console.log('👤 Создание администратора...');
        const adminLogin = process.env.DEFAULT_ADMIN_LOGIN || 'admin';
        const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';

        const existingAdmin = await User.findOne({ where: { login: adminLogin } });

        if (existingAdmin) {
            console.log(`   ⚠️  Администратор "${adminLogin}" уже существует`);
        } else {
            await User.create({
                login: adminLogin,
                password: adminPassword,
                role: 'admin'
            });
            console.log(`   ✅ Администратор создан:`);
            console.log(`      Логин: ${adminLogin}`);
            console.log(`      Пароль: ${adminPassword}`);
        }

        // Создаем базовые категории
        console.log('\n📁 Создание базовых категорий...');

        const categories = [
            {
                name: 'Видеоматериалы',
                description: 'Обучающие видео и видеоинструкции',
                order: 1,
                accessRoles: ['client', 'admin']
            },
            {
                name: 'Документация',
                description: 'Техническая документация и инструкции',
                order: 2,
                accessRoles: ['client', 'admin']
            },
            {
                name: 'Презентации',
                description: 'Презентационные материалы',
                order: 3,
                accessRoles: ['client', 'admin']
            },
            {
                name: 'Изображения',
                description: 'Графические материалы и схемы',
                order: 4,
                accessRoles: ['client', 'admin']
            },
            {
                name: 'Прочее',
                description: 'Прочие материалы',
                order: 5,
                accessRoles: ['client', 'admin']
            }
        ];

        let createdCount = 0;
        let existingCount = 0;

        for (const categoryData of categories) {
            const existing = await Category.findOne({ where: { name: categoryData.name } });

            if (existing) {
                existingCount++;
                console.log(`   ⚠️  Категория "${categoryData.name}" уже существует`);
            } else {
                await Category.create(categoryData);
                createdCount++;
                console.log(`   ✅ Создана категория: ${categoryData.name}`);
            }
        }

        console.log(`\n📊 Итого:`);
        console.log(`   Создано категорий: ${createdCount}`);
        console.log(`   Уже существовало: ${existingCount}`);

        console.log('\n✅ Заполнение базы данных завершено успешно!\n');
        console.log('💡 Теперь вы можете запустить приложение:');
        console.log('   npm start\n');

        process.exit(0);
    } catch (error) {
        console.error('❌ Ошибка заполнения данных:', error.message);
        console.error('\n📋 Детали ошибки:', error);
        process.exit(1);
    }
};

// Запускаем заполнение
seed();
