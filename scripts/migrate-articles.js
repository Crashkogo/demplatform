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
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `, { transaction: t });
        console.log('OK article_sections');

        // 1a. sort_order — для существующих таблиц article_sections
        const secCols = await sequelize.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'article_sections' AND column_name = 'sort_order';
        `, { type: QueryTypes.SELECT, transaction: t });
        if (secCols.length === 0) {
            await sequelize.query(`ALTER TABLE article_sections ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;`, { transaction: t });
            console.log('OK article_sections.sort_order');
        } else {
            console.log('SKIP article_sections.sort_order (already exists)');
        }

        // 2. articles
        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS articles (
                id SERIAL PRIMARY KEY,
                title VARCHAR(500) NOT NULL,
                content TEXT NOT NULL DEFAULT '',
                author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                published_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `, { transaction: t });
        console.log('OK articles');

        // 2a. published_at — для существующих таблиц articles
        const artCols = await sequelize.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'articles' AND column_name = 'published_at';
        `, { type: QueryTypes.SELECT, transaction: t });
        if (artCols.length === 0) {
            await sequelize.query(`
                ALTER TABLE articles ADD COLUMN published_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
                UPDATE articles SET published_at = created_at WHERE published_at IS NULL;
            `, { transaction: t });
            console.log('OK articles.published_at');
        } else {
            console.log('SKIP articles.published_at (already exists)');
        }

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

        // 7. can_generate_pro_review
        const proReviewCols = await sequelize.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'roles' AND column_name = 'can_generate_pro_review';
        `, { type: QueryTypes.SELECT, transaction: t });
        if (proReviewCols.length === 0) {
            await sequelize.query(
                `ALTER TABLE roles ADD COLUMN can_generate_pro_review BOOLEAN DEFAULT FALSE;`,
                { transaction: t }
            );
            console.log('OK roles.can_generate_pro_review');
        } else {
            console.log('SKIP roles.can_generate_pro_review (already exists)');
        }
        await sequelize.query(
            `UPDATE roles SET can_generate_pro_review = TRUE WHERE is_admin = TRUE;`,
            { transaction: t }
        );
        console.log('OK admin roles: can_generate_pro_review = TRUE');

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
