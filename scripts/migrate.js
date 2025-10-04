/**
 * Скрипт для миграции базы данных PostgreSQL
 * Автоматически создает все таблицы на основе моделей Sequelize
 * 
 * Использование:
 * node scripts/migrate.js - создает/обновляет таблицы
 * node scripts/migrate.js --force - пересоздает все таблицы (УДАЛЯЕТ ВСЕ ДАННЫЕ!)
 */

require('dotenv').config();
const { sequelize, User, Category, Material } = require('../models');

const migrate = async () => {
    try {
        console.log('🚀 Начало миграции базы данных...\n');

        // Проверяем подключение
        console.log('🔗 Проверка подключения к PostgreSQL...');
        await sequelize.authenticate();
        console.log('✅ Подключение к PostgreSQL установлено успешно\n');

        // Получаем параметры командной строки
        const args = process.argv.slice(2);
        const force = args.includes('--force');
        const alter = args.includes('--alter') || !force;

        if (force) {
            console.log('⚠️  ВНИМАНИЕ: Режим --force активирован!');
            console.log('⚠️  Все существующие таблицы будут удалены!\n');

            // Даем пользователю время прочитать предупреждение
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        // Синхронизируем модели с базой данных
        console.log('🔄 Синхронизация моделей с базой данных...');
        console.log(`   Режим: ${force ? 'FORCE (пересоздание)' : alter ? 'ALTER (обновление)' : 'CREATE (создание)'}\n`);

        await sequelize.sync({ force, alter: !force && alter });

        console.log('✅ Миграция завершена успешно!\n');

        // Выводим информацию о созданных таблицах
        console.log('📊 Созданные таблицы:');
        console.log('   - users (пользователи)');
        console.log('   - categories (категории)');
        console.log('   - materials (материалы)\n');

        console.log('💡 Следующий шаг: запустите seed скрипт для заполнения начальными данными');
        console.log('   npm run seed\n');

        process.exit(0);
    } catch (error) {
        console.error('❌ Ошибка миграции:', error.message);
        console.error('\n📋 Детали ошибки:', error);
        process.exit(1);
    }
};

// Запускаем миграцию
migrate();
