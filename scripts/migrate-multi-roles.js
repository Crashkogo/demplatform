/**
 * Миграция: переход от одной роли на пользователя к множеству ролей.
 * Создаёт таблицу user_roles, переносит данные из users.role_id,
 * делает колонку role_id nullable (данные остаются, но больше не используются).
 */

const { sequelize } = require('../config/database');
const logger = console;

async function migrate() {
    const t = await sequelize.transaction();
    try {
        // 1. Создаём junction-таблицу user_roles
        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS user_roles (
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (user_id, role_id)
            )
        `, { transaction: t });
        logger.log('Таблица user_roles создана (или уже существует).');

        // 2. Переносим существующие данные из users.role_id -> user_roles
        const [inserted] = await sequelize.query(`
            INSERT INTO user_roles (user_id, role_id)
            SELECT id, role_id FROM users WHERE role_id IS NOT NULL
            ON CONFLICT (user_id, role_id) DO NOTHING
        `, { transaction: t });
        logger.log('Данные перенесены из users.role_id в user_roles.');

        // 3. Делаем users.role_id nullable (колонка остаётся, но больше не обязательна)
        await sequelize.query(`
            ALTER TABLE users ALTER COLUMN role_id DROP NOT NULL
        `, { transaction: t });
        logger.log('Колонка users.role_id теперь nullable.');

        await t.commit();
        logger.log('Миграция завершена успешно.');
    } catch (err) {
        await t.rollback();
        logger.error('Миграция провалилась, откат:', err.message);
        process.exit(1);
    } finally {
        await sequelize.close();
    }
}

migrate();
