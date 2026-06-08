'use strict';

/**
 * Миграция: добавляет таблицу article_subsections и FK subsection_id в articles.
 * Затем создаёт 6 под-разделов и присваивает все существующие статьи к "Обзоры".
 *
 * Запуск: node scripts/migrate-add-article-subsections.js
 */

require('dotenv').config();
const { sequelize } = require('../config/database');
const { QueryInterface, DataTypes } = require('sequelize');

const SUBSECTIONS = [
    { name: 'Обзоры',           sort_order: 1 },
    { name: 'НПА',              sort_order: 2 },
    { name: 'Волгоград',        sort_order: 3 },
    { name: 'Письма',           sort_order: 4 },
    { name: 'Путеводители',     sort_order: 5 },
    { name: 'Готовые решения',  sort_order: 6 },
];

async function run() {
    const qi = sequelize.getQueryInterface();

    console.log('1. Создаём таблицу article_subsections...');
    const tables = await qi.showAllTables();
    if (tables.includes('article_subsections')) {
        console.log('   Таблица уже существует — пропускаем создание.');
    } else {
        await qi.createTable('article_subsections', {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                allowNull: false,
            },
            name: {
                type: DataTypes.STRING(200),
                allowNull: false,
            },
            sort_order: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 0,
            },
            created_at: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW,
            },
            updated_at: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW,
            },
        });
        console.log('   Таблица article_subsections создана.');
    }

    console.log('2. Добавляем колонку subsection_id в articles...');
    const cols = await qi.describeTable('articles');
    if (cols.subsection_id) {
        console.log('   Колонка уже существует — пропускаем.');
    } else {
        await qi.addColumn('articles', 'subsection_id', {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: { model: 'article_subsections', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
        });
        console.log('   Колонка subsection_id добавлена.');
    }

    console.log('3. Наполняем под-разделы...');
    const [existing] = await sequelize.query(
        'SELECT name FROM article_subsections ORDER BY sort_order'
    );
    if (existing.length > 0) {
        console.log('   Под-разделы уже есть:', existing.map(r => r.name).join(', '));
    } else {
        const now = new Date().toISOString();
        for (const sub of SUBSECTIONS) {
            await sequelize.query(
                'INSERT INTO article_subsections (name, sort_order, created_at, updated_at) VALUES (:name, :sort_order, :now, :now)',
                { replacements: { name: sub.name, sort_order: sub.sort_order, now } }
            );
        }
        console.log('   Создано', SUBSECTIONS.length, 'под-разделов.');
    }

    console.log('4. Присваиваем существующим статьям под-раздел "Обзоры"...');
    const [[obzory]] = await sequelize.query(
        "SELECT id FROM article_subsections WHERE name = 'Обзоры' LIMIT 1"
    );
    if (!obzory) {
        console.error('   Под-раздел "Обзоры" не найден — пропускаем.');
    } else {
        const [result] = await sequelize.query(
            'UPDATE articles SET subsection_id = :id WHERE subsection_id IS NULL',
            { replacements: { id: obzory.id } }
        );
        const count = result?.rowCount ?? result;
        console.log(`   Обновлено статей: ${typeof count === 'object' ? JSON.stringify(count) : count}`);
    }

    console.log('\nМиграция завершена успешно.');
    await sequelize.close();
}

run().catch(err => {
    console.error('Ошибка миграции:', err);
    process.exit(1);
});
