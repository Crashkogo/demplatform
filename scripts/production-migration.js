// scripts/production-migration.js
// Скрипт для миграции базы данных на production сервере
// Приводит структуру таблиц в соответствие с моделями без потери данных

const { sequelize } = require('../config/database');
const { QueryInterface, DataTypes } = require('sequelize');

async function runProductionMigration() {
    const queryInterface = sequelize.getQueryInterface();

    try {
        console.log('\n========================================');
        console.log('🚀 ЗАПУСК PRODUCTION МИГРАЦИИ');
        console.log('========================================\n');

        // ============================================
        // ШАГ 1: Подключение к базе данных
        // ============================================
        console.log('📡 Шаг 1/7: Подключение к базе данных...');
        await sequelize.authenticate();
        console.log('✅ Подключение установлено\n');

        // ============================================
        // ШАГ 2: Создание/обновление таблицы roles
        // ============================================
        console.log('🔧 Шаг 2/7: Проверка и обновление таблицы roles...');

        const tables = await queryInterface.showAllTables();

        if (!tables.includes('roles')) {
            console.log('   📝 Создание таблицы roles...');
            await queryInterface.createTable('roles', {
                id: {
                    type: DataTypes.INTEGER,
                    primaryKey: true,
                    autoIncrement: true
                },
                name: {
                    type: DataTypes.STRING(100),
                    allowNull: false,
                    unique: true
                },
                description: {
                    type: DataTypes.TEXT,
                    allowNull: true
                },
                is_admin: {
                    type: DataTypes.BOOLEAN,
                    defaultValue: false
                },
                can_view_materials: {
                    type: DataTypes.BOOLEAN,
                    defaultValue: true
                },
                can_download_materials: {
                    type: DataTypes.BOOLEAN,
                    defaultValue: false
                },
                can_create_materials: {
                    type: DataTypes.BOOLEAN,
                    defaultValue: false
                },
                can_edit_materials: {
                    type: DataTypes.BOOLEAN,
                    defaultValue: false
                },
                can_delete_materials: {
                    type: DataTypes.BOOLEAN,
                    defaultValue: false
                },
                can_create_categories: {
                    type: DataTypes.BOOLEAN,
                    defaultValue: false
                },
                can_edit_categories: {
                    type: DataTypes.BOOLEAN,
                    defaultValue: false
                },
                can_delete_categories: {
                    type: DataTypes.BOOLEAN,
                    defaultValue: false
                },
                can_manage_all_categories: {
                    type: DataTypes.BOOLEAN,
                    defaultValue: false
                },
                category_access_type: {
                    type: DataTypes.ENUM('all', 'selected'),
                    defaultValue: 'selected'
                },
                can_view_users: {
                    type: DataTypes.BOOLEAN,
                    defaultValue: false
                },
                can_create_users: {
                    type: DataTypes.BOOLEAN,
                    defaultValue: false
                },
                can_edit_users: {
                    type: DataTypes.BOOLEAN,
                    defaultValue: false
                },
                can_delete_users: {
                    type: DataTypes.BOOLEAN,
                    defaultValue: false
                },
                can_view_logs: {
                    type: DataTypes.BOOLEAN,
                    defaultValue: false
                },
                can_manage_roles: {
                    type: DataTypes.BOOLEAN,
                    defaultValue: false
                },
                created_at: {
                    type: DataTypes.DATE,
                    allowNull: true,
                    defaultValue: DataTypes.NOW
                },
                updated_at: {
                    type: DataTypes.DATE,
                    allowNull: true,
                    defaultValue: DataTypes.NOW
                }
            });
            console.log('   ✅ Таблица roles создана');
        } else {
            console.log('   ℹ️  Таблица roles существует, проверка колонок...');

            // Получаем описание таблицы
            const roleColumns = await queryInterface.describeTable('roles');

            // Список всех необходимых колонок
            const requiredColumns = {
                name: { type: DataTypes.STRING(100), allowNull: false },
                description: { type: DataTypes.TEXT, allowNull: true },
                is_admin: { type: DataTypes.BOOLEAN, defaultValue: false },
                can_view_materials: { type: DataTypes.BOOLEAN, defaultValue: true },
                can_download_materials: { type: DataTypes.BOOLEAN, defaultValue: false },
                can_create_materials: { type: DataTypes.BOOLEAN, defaultValue: false },
                can_edit_materials: { type: DataTypes.BOOLEAN, defaultValue: false },
                can_delete_materials: { type: DataTypes.BOOLEAN, defaultValue: false },
                can_create_categories: { type: DataTypes.BOOLEAN, defaultValue: false },
                can_edit_categories: { type: DataTypes.BOOLEAN, defaultValue: false },
                can_delete_categories: { type: DataTypes.BOOLEAN, defaultValue: false },
                can_manage_all_categories: { type: DataTypes.BOOLEAN, defaultValue: false },
                category_access_type: { type: DataTypes.ENUM('all', 'selected'), defaultValue: 'selected' },
                can_view_users: { type: DataTypes.BOOLEAN, defaultValue: false },
                can_create_users: { type: DataTypes.BOOLEAN, defaultValue: false },
                can_edit_users: { type: DataTypes.BOOLEAN, defaultValue: false },
                can_delete_users: { type: DataTypes.BOOLEAN, defaultValue: false },
                can_view_logs: { type: DataTypes.BOOLEAN, defaultValue: false },
                can_manage_roles: { type: DataTypes.BOOLEAN, defaultValue: false },
                created_at: { type: DataTypes.DATE, allowNull: false },
                updated_at: { type: DataTypes.DATE, allowNull: false }
            };

            // Добавляем недостающие колонки
            for (const [columnName, columnDef] of Object.entries(requiredColumns)) {
                if (!roleColumns[columnName]) {
                    console.log(`   📝 Добавление колонки ${columnName}...`);
                    await queryInterface.addColumn('roles', columnName, columnDef);
                }
            }
            console.log('   ✅ Таблица roles обновлена');
        }

        // ============================================
        // ШАГ 3: Обновление таблицы users
        // ============================================
        console.log('\n🔧 Шаг 3/7: Проверка и обновление таблицы users...');

        const userColumns = await queryInterface.describeTable('users');

        // Добавляем created_at если его нет
        if (!userColumns.created_at) {
            console.log('   📝 Добавление колонки created_at...');
            // Сначала добавляем как nullable
            await queryInterface.addColumn('users', 'created_at', {
                type: DataTypes.DATE,
                allowNull: true
            });
            // Заполняем текущей датой для существующих записей
            await sequelize.query("UPDATE users SET created_at = NOW() WHERE created_at IS NULL");
            // Теперь делаем NOT NULL
            await queryInterface.changeColumn('users', 'created_at', {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW
            });
            console.log('   ✅ Колонка created_at добавлена и заполнена');
        }

        // Добавляем updated_at если его нет
        if (!userColumns.updated_at) {
            console.log('   📝 Добавление колонки updated_at...');
            // Сначала добавляем как nullable
            await queryInterface.addColumn('users', 'updated_at', {
                type: DataTypes.DATE,
                allowNull: true
            });
            // Заполняем текущей датой для существующих записей
            await sequelize.query("UPDATE users SET updated_at = NOW() WHERE updated_at IS NULL");
            // Теперь делаем NOT NULL
            await queryInterface.changeColumn('users', 'updated_at', {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW
            });
            console.log('   ✅ Колонка updated_at добавлена и заполнена');
        }

        // Добавляем role_id если его нет (временно с allowNull: true)
        if (!userColumns.role_id) {
            console.log('   📝 Добавление колонки role_id...');
            await queryInterface.addColumn('users', 'role_id', {
                type: DataTypes.INTEGER,
                allowNull: true,
                references: {
                    model: 'roles',
                    key: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'RESTRICT'
            });
        }

        // Добавляем lastLogin если его нет
        if (!userColumns.lastLogin && !userColumns.last_login) {
            console.log('   📝 Добавление колонки last_login...');
            await queryInterface.addColumn('users', 'last_login', {
                type: DataTypes.DATE,
                allowNull: true
            });
        }

        console.log('   ✅ Таблица users обновлена\n');

        // ============================================
        // ШАГ 4: Обновление таблицы categories
        // ============================================
        console.log('🔧 Шаг 4/7: Проверка и обновление таблицы categories...');

        const categoryColumns = await queryInterface.describeTable('categories');

        // Добавляем created_at если его нет
        if (!categoryColumns.created_at) {
            console.log('   📝 Добавление колонки created_at...');
            // Сначала добавляем как nullable
            await queryInterface.addColumn('categories', 'created_at', {
                type: DataTypes.DATE,
                allowNull: true
            });
            // Заполняем текущей датой для существующих записей
            await sequelize.query("UPDATE categories SET created_at = NOW() WHERE created_at IS NULL");
            // Теперь делаем NOT NULL
            await queryInterface.changeColumn('categories', 'created_at', {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW
            });
            console.log('   ✅ Колонка created_at добавлена и заполнена');
        }

        // Добавляем updated_at если его нет
        if (!categoryColumns.updated_at) {
            console.log('   📝 Добавление колонки updated_at...');
            // Сначала добавляем как nullable
            await queryInterface.addColumn('categories', 'updated_at', {
                type: DataTypes.DATE,
                allowNull: true
            });
            // Заполняем текущей датой для существующих записей
            await sequelize.query("UPDATE categories SET updated_at = NOW() WHERE updated_at IS NULL");
            // Теперь делаем NOT NULL
            await queryInterface.changeColumn('categories', 'updated_at', {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW
            });
            console.log('   ✅ Колонка updated_at добавлена и заполнена');
        }

        console.log('   ✅ Таблица categories обновлена\n');

        // ============================================
        // ШАГ 5: Обновление таблицы materials
        // ============================================
        console.log('🔧 Шаг 5/7: Проверка и обновление таблицы materials...');

        const materialColumns = await queryInterface.describeTable('materials');

        // Добавляем created_at если его нет
        if (!materialColumns.created_at) {
            console.log('   📝 Добавление колонки created_at...');
            // Сначала добавляем как nullable
            await queryInterface.addColumn('materials', 'created_at', {
                type: DataTypes.DATE,
                allowNull: true
            });
            // Заполняем текущей датой для существующих записей
            await sequelize.query("UPDATE materials SET created_at = NOW() WHERE created_at IS NULL");
            // Теперь делаем NOT NULL
            await queryInterface.changeColumn('materials', 'created_at', {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW
            });
            console.log('   ✅ Колонка created_at добавлена и заполнена');
        }

        // Добавляем updated_at если его нет
        if (!materialColumns.updated_at) {
            console.log('   📝 Добавление колонки updated_at...');
            // Сначала добавляем как nullable
            await queryInterface.addColumn('materials', 'updated_at', {
                type: DataTypes.DATE,
                allowNull: true
            });
            // Заполняем текущей датой для существующих записей
            await sequelize.query("UPDATE materials SET updated_at = NOW() WHERE updated_at IS NULL");
            // Теперь делаем NOT NULL
            await queryInterface.changeColumn('materials', 'updated_at', {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW
            });
            console.log('   ✅ Колонка updated_at добавлена и заполнена');
        }

        console.log('   ✅ Таблица materials обновлена\n');

        // ============================================
        // ШАГ 6: Создание таблицы role_categories
        // ============================================
        console.log('🔧 Шаг 6/7: Проверка промежуточной таблицы role_categories...');

        if (!tables.includes('role_categories')) {
            console.log('   📝 Создание таблицы role_categories...');
            await queryInterface.createTable('role_categories', {
                role_id: {
                    type: DataTypes.INTEGER,
                    allowNull: false,
                    references: {
                        model: 'roles',
                        key: 'id'
                    },
                    onUpdate: 'CASCADE',
                    onDelete: 'CASCADE'
                },
                category_id: {
                    type: DataTypes.INTEGER,
                    allowNull: false,
                    references: {
                        model: 'categories',
                        key: 'id'
                    },
                    onUpdate: 'CASCADE',
                    onDelete: 'CASCADE'
                },
                created_at: {
                    type: DataTypes.DATE,
                    allowNull: true,
                    defaultValue: DataTypes.NOW
                },
                updated_at: {
                    type: DataTypes.DATE,
                    allowNull: true,
                    defaultValue: DataTypes.NOW
                }
            });

            // Добавляем составной первичный ключ
            await sequelize.query(
                'ALTER TABLE role_categories ADD PRIMARY KEY (role_id, category_id)'
            );

            console.log('   ✅ Таблица role_categories создана');
        } else {
            console.log('   ℹ️  Таблица role_categories уже существует');
        }

        console.log('   ✅ Промежуточная таблица готова\n');

        // ============================================
        // ШАГ 7: Создание/обновление таблицы audit_events
        // ============================================
        console.log('🔧 Шаг 7/7: Проверка таблицы audit_events...');

        if (!tables.includes('audit_events')) {
            console.log('   📝 Создание таблицы audit_events...');
            await queryInterface.createTable('audit_events', {
                id: {
                    type: DataTypes.INTEGER,
                    primaryKey: true,
                    autoIncrement: true
                },
                user_id: {
                    type: DataTypes.INTEGER,
                    allowNull: true,
                    references: {
                        model: 'users',
                        key: 'id'
                    }
                },
                event_type: {
                    type: DataTypes.STRING,
                    allowNull: false
                },
                details: {
                    type: DataTypes.JSONB,
                    allowNull: true
                },
                created_at: {
                    type: DataTypes.DATE,
                    allowNull: true,
                    defaultValue: DataTypes.NOW
                },
                updated_at: {
                    type: DataTypes.DATE,
                    allowNull: true,
                    defaultValue: DataTypes.NOW
                }
            });
            console.log('   ✅ Таблица audit_events создана');
        } else {
            console.log('   ℹ️  Таблица audit_events уже существует');
        }

        console.log('\n========================================');
        console.log('📊 НАПОЛНЕНИЕ ДАННЫМИ');
        console.log('========================================\n');

        // ============================================
        // ДАННЫЕ: Создание роли "Администратор"
        // ============================================
        console.log('👤 Создание роли "Администратор"...');

        const [adminRole] = await sequelize.query(
            `INSERT INTO roles (
                name, description, is_admin,
                can_view_materials, can_download_materials, can_create_materials,
                can_edit_materials, can_delete_materials, can_create_categories,
                can_edit_categories, can_delete_categories, can_manage_all_categories,
                category_access_type, can_view_users, can_create_users,
                can_edit_users, can_delete_users, can_view_logs, can_manage_roles,
                created_at, updated_at
            ) VALUES (
                'Администратор', 
                'Полный доступ ко всем функциям системы', 
                true,
                true, true, true,
                true, true, true,
                true, true, true,
                'all', true, true,
                true, true, true, true,
                NOW(), NOW()
            )
            ON CONFLICT (name) 
            DO UPDATE SET
                description = EXCLUDED.description,
                is_admin = EXCLUDED.is_admin,
                can_view_materials = EXCLUDED.can_view_materials,
                can_download_materials = EXCLUDED.can_download_materials,
                can_create_materials = EXCLUDED.can_create_materials,
                can_edit_materials = EXCLUDED.can_edit_materials,
                can_delete_materials = EXCLUDED.can_delete_materials,
                can_create_categories = EXCLUDED.can_create_categories,
                can_edit_categories = EXCLUDED.can_edit_categories,
                can_delete_categories = EXCLUDED.can_delete_categories,
                can_manage_all_categories = EXCLUDED.can_manage_all_categories,
                category_access_type = EXCLUDED.category_access_type,
                can_view_users = EXCLUDED.can_view_users,
                can_create_users = EXCLUDED.can_create_users,
                can_edit_users = EXCLUDED.can_edit_users,
                can_delete_users = EXCLUDED.can_delete_users,
                can_view_logs = EXCLUDED.can_view_logs,
                can_manage_roles = EXCLUDED.can_manage_roles,
                updated_at = NOW()
            RETURNING id`,
            { type: sequelize.QueryTypes.SELECT }
        );

        const adminRoleId = adminRole.id;
        console.log(`✅ Роль "Администратор" создана/обновлена (ID: ${adminRoleId})\n`);

        // ============================================
        // ДАННЫЕ: Создание роли "Клиент"
        // ============================================
        console.log('👤 Создание роли "Клиент" (по умолчанию)...');

        const [clientRole] = await sequelize.query(
            `INSERT INTO roles (
                name, description, is_admin,
                can_view_materials, can_download_materials,
                created_at, updated_at
            ) VALUES (
                'Клиент', 
                'Базовый доступ к просмотру и скачиванию материалов', 
                false,
                true, true,
                NOW(), NOW()
            )
            ON CONFLICT (name) 
            DO UPDATE SET
                description = EXCLUDED.description,
                updated_at = NOW()
            RETURNING id`,
            { type: sequelize.QueryTypes.SELECT }
        );

        const clientRoleId = clientRole.id;
        console.log(`✅ Роль "Клиент" создана/обновлена (ID: ${clientRoleId})\n`);

        // ============================================
        // ДАННЫЕ: Назначение роли пользователю admin
        // ============================================
        console.log('🔐 Назначение роли "Администратор" пользователю "admin"...');

        const [adminUserResult] = await sequelize.query(
            `UPDATE users 
             SET role_id = :adminRoleId, updated_at = NOW()
             WHERE login = 'admin'
             RETURNING id, login`,
            {
                replacements: { adminRoleId },
                type: sequelize.QueryTypes.UPDATE
            }
        );

        if (adminUserResult && adminUserResult.length > 0) {
            console.log(`✅ Пользователю "admin" (ID: ${adminUserResult[0].id}) назначена роль "Администратор"\n`);
        } else {
            console.log('⚠️  Пользователь "admin" не найден в базе данных\n');
        }

        // ============================================
        // ДАННЫЕ: Назначение роли остальным пользователям
        // ============================================
        console.log('👥 Назначение роли "Клиент" пользователям без роли...');

        const [usersUpdated] = await sequelize.query(
            `UPDATE users 
             SET role_id = :clientRoleId, updated_at = NOW()
             WHERE role_id IS NULL`,
            {
                replacements: { clientRoleId },
                type: sequelize.QueryTypes.UPDATE
            }
        );

        console.log(`✅ Роль "Клиент" назначена ${usersUpdated.length || 0} пользователям\n`);

        // ============================================
        // ФИНАЛ: Установка NOT NULL для role_id
        // ============================================
        console.log('🔒 Установка ограничения NOT NULL для role_id...');

        await queryInterface.changeColumn('users', 'role_id', {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'roles',
                key: 'id'
            },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT'
        });

        console.log('✅ Ограничение установлено\n');

        console.log('========================================');
        console.log('✨ МИГРАЦИЯ УСПЕШНО ЗАВЕРШЕНА!');
        console.log('========================================\n');

        console.log('📋 Итоги:');
        console.log('   ✅ Все таблицы приведены в соответствие с моделями');
        console.log('   ✅ Роль "Администратор" создана со всеми правами');
        console.log('   ✅ Роль "Администратор" назначена пользователю "admin"');
        console.log('   ✅ Роль "Клиент" назначена остальным пользователям');
        console.log('   ✅ Данные сохранены без потерь\n');

    } catch (error) {
        console.error('\n❌ ОШИБКА ПРИ ВЫПОЛНЕНИИ МИГРАЦИИ:');
        console.error(error);
        console.error('\nСтек ошибки:', error.stack);
        process.exit(1);
    } finally {
        await sequelize.close();
        console.log('🔌 Соединение с базой данных закрыто.\n');
        process.exit(0);
    }
}

// Запуск миграции
runProductionMigration();

