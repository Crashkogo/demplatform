// scripts/migrate-add-organizations.js
// Миграция: создать таблицу organizations, добавить organization_id в users и roles
require('dotenv').config();
const { sequelize } = require('../config/database');

async function migrate() {
    const t = await sequelize.transaction();
    try {
        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS organizations (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL UNIQUE,
                description TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            )
        `, { transaction: t });

        await sequelize.query(`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL
        `, { transaction: t });

        await sequelize.query(`
            ALTER TABLE roles
            ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL
        `, { transaction: t });

        await t.commit();
        console.log('✅ Миграция organizations выполнена успешно');
    } catch (err) {
        await t.rollback();
        console.error('❌ Ошибка миграции:', err.message);
        process.exit(1);
    } finally {
        await sequelize.close();
    }
}

migrate();
