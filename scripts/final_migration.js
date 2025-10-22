// scripts/final_migration.js
// Обновленная версия скрипта для безболезненной миграции схемы БД.

const { sequelize, User, Role } = require('../models');
const { DataTypes, QueryTypes } = require('sequelize'); // Правильный импорт для DataTypes

async function runFinalMigration() {
    const queryInterface = sequelize.getQueryInterface();

    try {
        console.log('--- Запуск исправительной миграции ---');

        console.log('🔄 1/7: Подключение к базе данных...');
        await sequelize.authenticate();
        console.log('✅ 1/7: Подключено к базе данных');

        // --- Шаг 2: Создание ролей ---
        console.log('🔄 2/7: Создание/обновление ролей "Администратор" и "Клиент"...');
        const adminPermissions = {
            name: 'Администратор',
            description: 'Полный доступ ко всем функциям системы',
            isAdmin: true,
            canViewMaterials: true,
            canDownloadMaterials: true,
            canCreateMaterials: true,
            canEditMaterials: true,
            canDeleteMaterials: true,
            canCreateCategories: true,
            canEditCategories: true,
            canDeleteCategories: true,
            canManageAllCategories: true,
            categoryAccessType: 'all',
            canViewUsers: true,
            canCreateUsers: true,
            canEditUsers: true,
            canDeleteUsers: true,
            canViewLogs: true,
            canManageRoles: true
        };
        const [adminRole] = await Role.findOrCreate({ where: { name: 'Администратор' }, defaults: adminPermissions });
        await adminRole.update(adminPermissions, { timestamps: false });

        const clientPermissions = {
            name: 'Клиент',
            description: 'Базовый доступ к просмотру материалов',
            isAdmin: false,
            canViewMaterials: true,
            canDownloadMaterials: true,
        };
        const [clientRole] = await Role.findOrCreate({ where: { name: 'Клиент' }, defaults: clientPermissions });
        console.log('✅ 2/7: Роли успешно созданы/обновлены.');

        // --- Шаг 3: Добавление колонки role_id (если ее нет) ---
        console.log('🔄 3/7: Проверка и добавление колонки "role_id" в таблицу "users"...');
        const tableDescription = await queryInterface.describeTable('users');
        if (!tableDescription.role_id) {
            await queryInterface.addColumn('users', 'role_id', {
                type: DataTypes.INTEGER,
                references: {
                    model: 'roles',
                    key: 'id',
                },
                onUpdate: 'CASCADE',
                onDelete: 'SET NULL',
                allowNull: true
            });
            console.log('✅ Колонка "role_id" добавлена.');
        } else {
            console.log('ℹ️ Колонка "role_id" уже существует.');
        }

        // --- Шаг 4: Присвоение роли по умолчанию через ПРЯМОЙ SQL-ЗАПРОС ---
        console.log('🔄 4/7: Присвоение роли "Клиент" пользователям без роли (RAW SQL)...');
        const [results, metadata] = await sequelize.query(
            'UPDATE "users" SET "role_id" = :roleId WHERE "role_id" IS NULL',
            {
                replacements: { roleId: clientRole.id },
                type: QueryTypes.UPDATE
            }
        );
        
        if (metadata && metadata.rowCount > 0) {
            console.log(`✅ 4/7: Роль по умолчанию назначена ${metadata.rowCount} пользователям.`);
        } else {
            console.log('✅ 4/7: Все пользователи уже имеют роли.');
        }
        

        // --- Шаг 5: Установка ограничения NOT NULL ---
        console.log('🔄 5/7: Установка ограничения NOT NULL для колонки "role_id"...');
        await queryInterface.changeColumn('users', 'role_id', {
            type: DataTypes.INTEGER,
            allowNull: false
        });
        console.log('✅ 5/7: Ограничение NOT NULL установлено.');

        // --- Шаг 6: Назначение роли администратору ---
        console.log('🔄 6/7: Назначение роли "Администратор" пользователю "admin"...');
        const adminUser = await User.findOne({ where: { login: 'admin' } });
        if (adminUser) {
            await sequelize.query('UPDATE "users" SET "role_id" = :roleId WHERE "id" = :userId', {
                replacements: { roleId: adminRole.id, userId: adminUser.id },
                type: QueryTypes.UPDATE
            });
            console.log(`✅ Пользователю "admin" успешно назначена роль "Администратор".`);
        } else {
            console.warn('⚠️ Пользователь "admin" не найден. Этот шаг пропущен.');
        }

        // --- Шаг 7: Финальная синхронизация ---
        console.log('🔄 7/7: Финальная синхронизация моделей для применения остальных изменений...');
        await sequelize.sync({ alter: true });
        console.log('✅ 7/7: Все модели синхронизированы.');


        console.log('\n🎉 --- Исправительная миграция успешно завершена! ---');

    } catch (error) {
        console.error('❌ Ошибка во время миграции:', error);
        process.exit(1);
    } finally {
        if (sequelize) {
            await sequelize.close();
            console.log('🔌 Соединение с базой данных закрыто.');
        }
        process.exit(0);
    }
}

runFinalMigration();
