// scripts/migrate-role-categories.js
const { sequelize } = require('../config/database');

async function migrateRoleCategories() {
    try {
        console.log('🔄 Начинаем миграцию для таблицы role_categories...');

        // Создаём таблицу role_categories для связи многие-ко-многим
        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS role_categories (
                role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
                category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (role_id, category_id)
            );
        `);

        console.log('✅ Таблица role_categories создана');

        // Создаём индексы для оптимизации запросов
        await sequelize.query(`
            CREATE INDEX IF NOT EXISTS idx_role_categories_role_id 
            ON role_categories(role_id);
        `);

        await sequelize.query(`
            CREATE INDEX IF NOT EXISTS idx_role_categories_category_id 
            ON role_categories(category_id);
        `);

        console.log('✅ Индексы созданы');
        console.log('✅ Миграция завершена успешно!');

        process.exit(0);
    } catch (error) {
        console.error('❌ Ошибка миграции:', error);
        process.exit(1);
    }
}

migrateRoleCategories();

