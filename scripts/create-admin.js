// scripts/create-admin.js
// Скрипт для создания/восстановления администратора

const { sequelize, User, Role } = require('../models');

async function createAdmin() {
    try {
        console.log('🔄 Подключение к базе данных...');
        await sequelize.authenticate();
        console.log('✅ Подключено к базе данных');

        // Ищем или создаем роль Администратор
        let [adminRole, created] = await Role.findOrCreate({
            where: { name: 'Администратор' },
            defaults: {
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
            }
        });

        if (created) {
            console.log('✅ Роль "Администратор" создана');
        } else {
            console.log('✅ Роль "Администратор" найдена');
            // Обновляем роль, чтобы убедиться что все права установлены
            await adminRole.update({
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
            });
            console.log('✅ Права роли "Администратор" обновлены');
        }

        // Ищем пользователя admin
        let adminUser = await User.findOne({ where: { login: 'admin' } });

        if (adminUser) {
            // Обновляем существующего пользователя
            await adminUser.update({
                roleId: adminRole.id,
                password: 'admin123' // Сбрасываем пароль на дефолтный
            });
            console.log('✅ Пользователь "admin" обновлен');
            console.log('   Логин: admin');
            console.log('   Пароль: admin123');
            console.log(`   Роль: ${adminRole.name} (ID: ${adminRole.id})`);
        } else {
            // Создаем нового пользователя
            adminUser = await User.create({
                login: 'admin',
                password: 'admin123',
                roleId: adminRole.id
            });
            console.log('✅ Пользователь "admin" создан');
            console.log('   Логин: admin');
            console.log('   Пароль: admin123');
            console.log(`   Роль: ${adminRole.name} (ID: ${adminRole.id})`);
        }

        console.log('\n🎉 Администратор успешно создан/восстановлен!');
        console.log('Вы можете войти в систему с учетными данными:');
        console.log('  Логин: admin');
        console.log('  Пароль: admin123');

        process.exit(0);
    } catch (error) {
        console.error('❌ Ошибка:', error);
        process.exit(1);
    }
}

createAdmin();

