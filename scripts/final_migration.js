// scripts/final_migration.js
// Скрипт для миграции схемы БД, создания роли "Администратор" и назначения ее пользователю admin.

const { sequelize, User, Role } = require('../models');

async function runFinalMigration() {
    try {
        console.log('--- Запуск финальной миграции ---');

        console.log('🔄 1/4: Подключение к базе данных...');
        await sequelize.authenticate();
        console.log('✅ 1/4: Подключено к базе данных');

        console.log('🔄 2/4: Синхронизация моделей с базой данных (alter: true)...');
        // alter: true изменяет существующие таблицы, чтобы они соответствовали моделям
        // Это не удаляет данные, но может изменить структуру таблиц.
        await sequelize.sync({ alter: true });
        console.log('✅ 2/4: Схема базы данных успешно обновлена.');

        console.log('🔄 3/4: Создание или обновление роли "Администратор" со всеми правами...');
        const allPermissions = {
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

        let [adminRole, created] = await Role.findOrCreate({
            where: { name: 'Администратор' },
            defaults: allPermissions
        });

        if (created) {
            console.log('✅ Роль "Администратор" создана.');
        } else {
            console.log('ℹ️ Роль "Администратор" уже существует. Обновление прав...');
            await adminRole.update(allPermissions);
            console.log('✅ Права роли "Администратор" обновлены.');
        }

        console.log('🔄 4/4: Поиск пользователя "admin" и назначение ему роли "Администратор"');
        const adminUser = await User.findOne({ where: { login: 'admin' } });

        if (adminUser) {
            await adminUser.update({ roleId: adminRole.id });
            console.log(`✅ Пользователю "admin" успешно назначена роль "Администратор" (ID роли: ${adminRole.id}).`);
        } else {
            console.warn('⚠️ Пользователь с логином "admin" не найден. Этот шаг пропущен.');
            console.warn('   Вы можете создать его, запустив: node scripts/create-admin.js');
        }

        console.log('\n🎉 --- Финальная миграция успешно завершена! ---');

    } catch (error) {
        console.error('❌ Ошибка во время миграции:', error);
        process.exit(1);
    } finally {
        await sequelize.close();
        console.log('🔌 Соединение с базой данных закрыто.');
        process.exit(0);
    }
}

runFinalMigration();
