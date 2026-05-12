/**
 * Миграция: система статей
 * Создаёт таблицы article_sections, articles, article_section_assignments, header_images
 * Добавляет can_create_articles, can_read_articles в roles
 */
const { sequelize } = require('../config/database');
const { QueryTypes } = require('sequelize');

async function migrate() {
    const t = await sequelize.transaction();
    try {
        // 1. article_sections
        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS article_sections (
                id SERIAL PRIMARY KEY,
                name VARCHAR(200) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `, { transaction: t });
        console.log('OK article_sections');

        // 2. articles
        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS articles (
                id SERIAL PRIMARY KEY,
                title VARCHAR(500) NOT NULL,
                content TEXT NOT NULL DEFAULT '',
                author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `, { transaction: t });
        console.log('OK articles');

        // 3. article_section_assignments (M2M)
        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS article_section_assignments (
                article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
                section_id INTEGER NOT NULL REFERENCES article_sections(id) ON DELETE CASCADE,
                PRIMARY KEY (article_id, section_id)
            );
        `, { transaction: t });
        console.log('OK article_section_assignments');

        // 4. header_images
        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS header_images (
                id SERIAL PRIMARY KEY,
                filename VARCHAR(500) NOT NULL,
                original_name VARCHAR(500),
                path VARCHAR(1000) NOT NULL,
                mime_type VARCHAR(100),
                size INTEGER,
                uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `, { transaction: t });
        console.log('OK header_images');

        // 5. ALTER roles
        const cols = await sequelize.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'roles' AND column_name IN ('can_create_articles', 'can_read_articles');
        `, { type: QueryTypes.SELECT, transaction: t });

        const existing = cols.map(c => c.column_name);

        if (!existing.includes('can_create_articles')) {
            await sequelize.query(`ALTER TABLE roles ADD COLUMN can_create_articles BOOLEAN DEFAULT FALSE;`, { transaction: t });
            console.log('OK roles.can_create_articles');
        } else {
            console.log('SKIP roles.can_create_articles (already exists)');
        }
        if (!existing.includes('can_read_articles')) {
            await sequelize.query(`ALTER TABLE roles ADD COLUMN can_read_articles BOOLEAN DEFAULT FALSE;`, { transaction: t });
            console.log('OK roles.can_read_articles');
        } else {
            console.log('SKIP roles.can_read_articles (already exists)');
        }

        // 6. Обновить admin-роли
        await sequelize.query(`
            UPDATE roles SET can_create_articles = TRUE, can_read_articles = TRUE WHERE is_admin = TRUE;
        `, { transaction: t });
        console.log('OK admin roles updated');

        await t.commit();
        console.log('\nMigration completed successfully');
    } catch (err) {
        await t.rollback();
        console.error('Migration failed:', err.message);
        process.exit(1);
    } finally {
        await sequelize.close();
    }
}

migrate();
