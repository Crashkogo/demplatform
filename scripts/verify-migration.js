// scripts/verify-migration.js
// Скрипт для проверки правильности выполненной миграции

const { sequelize } = require('../config/database');

async function verifyMigration() {
    try {
        console.log('\n========================================');
        console.log('🔍 ПРОВЕРКА МИГРАЦИИ');
        console.log('========================================\n');

        // Подключение
        console.log('📡 Подключение к базе данных...');
        await sequelize.authenticate();
        console.log('✅ Подключение установлено\n');

        const queryInterface = sequelize.getQueryInterface();
        const errors = [];
        const warnings = [];

        // ============================================
        // Проверка таблицы roles
        // ============================================
        console.log('🔍 Проверка таблицы roles...');

        const tables = await queryInterface.showAllTables();

        if (!tables.includes('roles')) {
            errors.push('❌ Таблица roles не существует');
        } else {
            console.log('   ✅ Таблица существует');

            const roleColumns = await queryInterface.describeTable('roles');
            const requiredRoleColumns = [
                'id', 'name', 'description', 'is_admin',
                'can_view_materials', 'can_download_materials', 'can_create_materials',
                'can_edit_materials', 'can_delete_materials', 'can_create_categories',
                'can_edit_categories', 'can_delete_categories', 'can_manage_all_categories',
                'category_access_type', 'can_view_users', 'can_create_users',
                'can_edit_users', 'can_delete_users', 'can_view_logs', 'can_manage_roles',
                'created_at', 'updated_at'
            ];

            for (const col of requiredRoleColumns) {
                if (!roleColumns[col]) {
                    errors.push(`❌ В таблице roles отсутствует колонка ${col}`);
                } else {
                    console.log(`   ✅ Колонка ${col} присутствует`);
                }
            }
        }

        // ============================================
        // Проверка таблицы users
        // ============================================
        console.log('\n🔍 Проверка таблицы users...');

        if (!tables.includes('users')) {
            errors.push('❌ Таблица users не существует');
        } else {
            console.log('   ✅ Таблица существует');

            const userColumns = await queryInterface.describeTable('users');
            const requiredUserColumns = ['id', 'login', 'password', 'role_id', 'created_at', 'updated_at'];

            for (const col of requiredUserColumns) {
                if (!userColumns[col]) {
                    errors.push(`❌ В таблице users отсутствует колонка ${col}`);
                } else {
                    console.log(`   ✅ Колонка ${col} присутствует`);
                }
            }

            // Проверка NOT NULL для role_id
            if (userColumns.role_id && userColumns.role_id.allowNull === false) {
                console.log('   ✅ Колонка role_id имеет ограничение NOT NULL');
            } else if (userColumns.role_id && userColumns.role_id.allowNull === true) {
                warnings.push('⚠️  Колонка role_id в таблице users может быть NULL (ожидается NOT NULL)');
            }
        }

        // ============================================
        // Проверка таблицы categories
        // ============================================
        console.log('\n🔍 Проверка таблицы categories...');

        if (!tables.includes('categories')) {
            errors.push('❌ Таблица categories не существует');
        } else {
            console.log('   ✅ Таблица существует');

            const categoryColumns = await queryInterface.describeTable('categories');
            const requiredCategoryColumns = ['id', 'name', 'created_at', 'updated_at'];

            for (const col of requiredCategoryColumns) {
                if (!categoryColumns[col]) {
                    errors.push(`❌ В таблице categories отсутствует колонка ${col}`);
                } else {
                    console.log(`   ✅ Колонка ${col} присутствует`);
                }
            }
        }

        // ============================================
        // Проверка таблицы materials
        // ============================================
        console.log('\n🔍 Проверка таблицы materials...');

        if (!tables.includes('materials')) {
            errors.push('❌ Таблица materials не существует');
        } else {
            console.log('   ✅ Таблица существует');

            const materialColumns = await queryInterface.describeTable('materials');
            const requiredMaterialColumns = ['id', 'title', 'created_at', 'updated_at'];

            for (const col of requiredMaterialColumns) {
                if (!materialColumns[col]) {
                    errors.push(`❌ В таблице materials отсутствует колонка ${col}`);
                } else {
                    console.log(`   ✅ Колонка ${col} присутствует`);
                }
            }
        }

        // ============================================
        // Проверка таблицы role_categories
        // ============================================
        console.log('\n🔍 Проверка таблицы role_categories...');

        if (!tables.includes('role_categories')) {
            errors.push('❌ Таблица role_categories не существует');
        } else {
            console.log('   ✅ Таблица существует');

            const roleCategoryColumns = await queryInterface.describeTable('role_categories');
            const requiredRoleCategoryColumns = ['role_id', 'category_id'];

            for (const col of requiredRoleCategoryColumns) {
                if (!roleCategoryColumns[col]) {
                    errors.push(`❌ В таблице role_categories отсутствует колонка ${col}`);
                } else {
                    console.log(`   ✅ Колонка ${col} присутствует`);
                }
            }
        }

        // ============================================
        // Проверка данных
        // ============================================
        console.log('\n🔍 Проверка данных...');

        // Проверка роли "Администратор"
        const [adminRoles] = await sequelize.query(
            "SELECT * FROM roles WHERE name = 'Администратор'",
            { type: sequelize.QueryTypes.SELECT }
        );

        if (!adminRoles) {
            errors.push('❌ Роль "Администратор" не найдена');
        } else {
            console.log('   ✅ Роль "Администратор" существует');

            if (adminRoles.is_admin !== true) {
                errors.push('❌ У роли "Администратор" флаг is_admin не равен true');
            } else {
                console.log('   ✅ Флаг is_admin = true');
            }
        }

        // Проверка роли "Клиент"
        const [clientRoles] = await sequelize.query(
            "SELECT * FROM roles WHERE name = 'Клиент'",
            { type: sequelize.QueryTypes.SELECT }
        );

        if (!clientRoles) {
            warnings.push('⚠️  Роль "Клиент" не найдена (опционально)');
        } else {
            console.log('   ✅ Роль "Клиент" существует');
        }

        // Проверка пользователя admin
        const [adminUser] = await sequelize.query(
            "SELECT u.*, r.name as role_name FROM users u LEFT JOIN roles r ON u.role_id = r.id WHERE u.login = 'admin'",
            { type: sequelize.QueryTypes.SELECT }
        );

        if (!adminUser) {
            warnings.push('⚠️  Пользователь "admin" не найден в системе');
        } else {
            console.log('   ✅ Пользователь "admin" существует');

            if (adminUser.role_name === 'Администратор') {
                console.log('   ✅ Пользователю "admin" назначена роль "Администратор"');
            } else {
                errors.push(`❌ Пользователю "admin" назначена роль "${adminUser.role_name}" вместо "Администратор"`);
            }
        }

        // Проверка пользователей без роли
        const [usersWithoutRole] = await sequelize.query(
            "SELECT COUNT(*) as count FROM users WHERE role_id IS NULL",
            { type: sequelize.QueryTypes.SELECT }
        );

        if (usersWithoutRole.count > 0) {
            warnings.push(`⚠️  Найдено ${usersWithoutRole.count} пользователей без назначенной роли`);
        } else {
            console.log('   ✅ Все пользователи имеют назначенные роли');
        }

        // ============================================
        // Вывод результатов
        // ============================================
        console.log('\n========================================');
        console.log('📊 РЕЗУЛЬТАТЫ ПРОВЕРКИ');
        console.log('========================================\n');

        if (errors.length === 0 && warnings.length === 0) {
            console.log('✅ ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ УСПЕШНО!');
            console.log('   Миграция выполнена корректно.\n');
        } else {
            if (errors.length > 0) {
                console.log('❌ ОБНАРУЖЕНЫ КРИТИЧЕСКИЕ ОШИБКИ:\n');
                errors.forEach(err => console.log(`   ${err}`));
                console.log('');
            }

            if (warnings.length > 0) {
                console.log('⚠️  ПРЕДУПРЕЖДЕНИЯ:\n');
                warnings.forEach(warn => console.log(`   ${warn}`));
                console.log('');
            }

            if (errors.length > 0) {
                console.log('❗ РЕКОМЕНДАЦИЯ: Запустите миграцию повторно или исправьте ошибки вручную.\n');
            }
        }

        // Статистика по таблицам
        console.log('📈 СТАТИСТИКА:\n');

        const stats = await Promise.all([
            sequelize.query("SELECT COUNT(*) as count FROM users", { type: sequelize.QueryTypes.SELECT }),
            sequelize.query("SELECT COUNT(*) as count FROM roles", { type: sequelize.QueryTypes.SELECT }),
            sequelize.query("SELECT COUNT(*) as count FROM categories", { type: sequelize.QueryTypes.SELECT }),
            sequelize.query("SELECT COUNT(*) as count FROM materials", { type: sequelize.QueryTypes.SELECT })
        ]);

        console.log(`   👤 Пользователей: ${stats[0][0].count}`);
        console.log(`   🔐 Ролей: ${stats[1][0].count}`);
        console.log(`   📁 Категорий: ${stats[2][0].count}`);
        console.log(`   📄 Материалов: ${stats[3][0].count}`);
        console.log('');

        process.exit(errors.length > 0 ? 1 : 0);

    } catch (error) {
        console.error('\n❌ ОШИБКА ПРИ ПРОВЕРКЕ:');
        console.error(error);
        process.exit(1);
    } finally {
        await sequelize.close();
        console.log('🔌 Соединение с базой данных закрыто.\n');
    }
}

// Запуск проверки
verifyMigration();

