// scripts/final_migration.js
// Финальная версия скрипта, которая сначала обновляет схему, потом данные.

const { sequelize, User, Role } = require('../models');
const { DataTypes, QueryTypes } = require('sequelize');

async function runFinalMigration() {
    const queryInterface = sequelize.getQueryInterface();

    try {
        console.log('--- Запуск комплексной миграции ---');

        console.log('🔄 1/6: Подключение к базе данных...');
        await sequelize.authenticate();
        console.log('✅ 1/6: Подключено к базе данных.');

        // --- Шаг 2: Массовое создание/обновление колонок --- 
        console.log('🔄 2/6: Временное изменение модели User для синхронизации...');
        // Временно разрешаем roleId быть NULL, чтобы sync прошел успешно
        User.rawAttributes.roleId.allowNull = true;

        console.log('🔄 2/6: Синхронизация схемы. Создание всех недостающих колонок...');
        await sequelize.sync({ alter: true });
        console.log('✅ 2/6: Схема базы данных успешно синхронизирована.');

        // --- Шаг 3: Создание ролей --- 
        console.log('🔄 3/6: Создание/обновление ролей "Администратор" и "Клиент"...');
        const adminPermissions = {
            name: 'Администратор',
            description: 'Полный доступ ко всем функциям системы',
            isAdmin: true, canViewMaterials: true, canDownloadMaterials: true, canCreateMaterials: true,
            canEditMaterials: true, canDeleteMaterials: true, canCreateCategories: true, canEditCategories: true,
            canDeleteCategories: true, canManageAllCategories: true, categoryAccessType: 'all', canViewUsers: true,
            canCreateUsers: true, canEditUsers: true, canDeleteUsers: true, canViewLogs: true, canManageRoles: true
        };
        const [adminRole] = await Role.findOrCreate({ where: { name: 'Администратор' }, defaults: adminPermissions });
        await adminRole.update(adminPermissions, { timestamps: false });

        const clientPermissions = {
            name: 'Клиент', description: 'Базовый доступ к просмотру материалов',
            isAdmin: false, canViewMaterials: true, canDownloadMaterials: true,
        };
        const [clientRole] = await Role.findOrCreate({ where: { name: 'Клиент' }, defaults: clientPermissions });
        console.log('✅ 3/6: Роли успешно созданы/обновлены.');

        // --- Шаг 4: Присвоение роли по умолчанию --- 
        console.log('🔄 4/6: Присвоение роли "Клиент" пользователям без роли...');
        // Теперь, когда все колонки на месте, можно использовать стандартный User.update
        const [updatedCount] = await User.update({ roleId: clientRole.id }, {
            where: { roleId: null },
            timestamps: false
        });

        if (updatedCount > 0) {
            console.log(`✅ 4/6: Роль по умолчанию назначена ${updatedCount} пользователям.`);
        } else {
            console.log('✅ 4/6: Все пользователи уже имеют роли.');
        }

        // --- Шаг 5: Назначение роли администратору ---
        console.log('🔄 5/6: Назначение роли "Администратор" пользователю "admin"...');
        const adminUser = await User.findOne({ where: { login: 'admin' } });
        if (adminUser) {
            await adminUser.update({ roleId: adminRole.id }, { timestamps: false });
            console.log(`✅ 5/6: Пользователю "admin" успешно назначена роль "Администратор".`);
        } else {
            console.warn('⚠️ 5/6: Пользователь "admin" не найден. Этот шаг пропущен.');
        }

        // --- Шаг 6: Возвращение ограничения NOT NULL --- 
        console.log('🔄 6/6: Установка ограничения NOT NULL для колонки "role_id"...');
        await queryInterface.changeColumn('users', 'role_id', {
            type: DataTypes.INTEGER,
            allowNull: false
        });
        console.log('✅ 6/6: Ограничение NOT NULL установлено.');

        console.log('\n🎉 --- Комплексная миграция успешно завершена! ---');

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
