// scripts/create-admin-with-role.js
// Скрипт для создания пользователя admin с ролью Администратор

const { sequelize, User, Role } = require('../models');
const bcrypt = require('bcrypt');

async function createAdminWithRole() {
    try {
        console.log('\n========================================');
        console.log('👤 СОЗДАНИЕ АДМИНИСТРАТОРА');
        console.log('========================================\n');

        // Подключение к БД
        console.log('📡 Подключение к базе данных...');
        await sequelize.authenticate();
        console.log('✅ Подключение установлено\n');

        // Проверяем, существует ли роль "Администратор"
        console.log('🔍 Проверка роли "Администратор"...');
        let adminRole = await Role.findOne({ where: { name: 'Администратор' } });

        if (!adminRole) {
            console.log('📝 Роль "Администратор" не найдена. Создание...');
            adminRole = await Role.create({
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
            });
            console.log(`✅ Роль "Администратор" создана (ID: ${adminRole.id})\n`);
        } else {
            console.log(`✅ Роль "Администратор" найдена (ID: ${adminRole.id})\n`);
        }

        // Проверяем, существует ли пользователь admin
        console.log('🔍 Проверка пользователя "admin"...');
        let adminUser = await User.findOne({ where: { login: 'admin' } });

        if (!adminUser) {
            console.log('📝 Пользователь "admin" не найден. Создание...');
            
            // Запрашиваем пароль (или используем значение по умолчанию)
            const defaultPassword = 'admin123';
            console.log(`ℹ️  Используется пароль по умолчанию: ${defaultPassword}`);
            console.log('⚠️  ВАЖНО: Смените пароль после первого входа!\n');

            adminUser = await User.create({
                login: 'admin',
                password: defaultPassword, // Будет автоматически хеширован через хук beforeSave
                roleId: adminRole.id
            });

            console.log(`✅ Пользователь "admin" создан (ID: ${adminUser.id})`);
            console.log(`✅ Назначена роль: "${adminRole.name}"\n`);
        } else {
            console.log(`✅ Пользователь "admin" найден (ID: ${adminUser.id})`);
            
            // Проверяем и обновляем роль, если нужно
            if (adminUser.roleId !== adminRole.id) {
                console.log('📝 Обновление роли пользователя "admin"...');
                await adminUser.update({ roleId: adminRole.id });
                console.log(`✅ Роль обновлена на "Администратор"\n`);
            } else {
                console.log(`✅ Роль уже назначена: "${adminRole.name}"\n`);
            }
        }

        // Проверка прав
        console.log('🔍 Проверка прав пользователя...');
        const userWithRole = await User.findOne({
            where: { login: 'admin' },
            include: [{
                model: Role,
                as: 'roleData'
            }]
        });

        if (userWithRole && userWithRole.roleData) {
            console.log('✅ Права пользователя:');
            console.log(`   - Администратор: ${userWithRole.roleData.isAdmin ? 'Да' : 'Нет'}`);
            console.log(`   - Просмотр материалов: ${userWithRole.roleData.canViewMaterials ? 'Да' : 'Нет'}`);
            console.log(`   - Создание материалов: ${userWithRole.roleData.canCreateMaterials ? 'Да' : 'Нет'}`);
            console.log(`   - Управление пользователями: ${userWithRole.roleData.canViewUsers ? 'Да' : 'Нет'}`);
            console.log(`   - Управление ролями: ${userWithRole.roleData.canManageRoles ? 'Да' : 'Нет'}`);
        }

        console.log('\n========================================');
        console.log('✅ ГОТОВО!');
        console.log('========================================\n');

        console.log('📋 Информация для входа:');
        console.log(`   Логин: admin`);
        if (!adminUser.changed('password')) {
            console.log(`   Пароль: (используйте существующий)`);
        } else {
            console.log(`   Пароль: admin123`);
            console.log(`   ⚠️  СМЕНИТЕ ПАРОЛЬ ПОСЛЕ ПЕРВОГО ВХОДА!`);
        }
        console.log('');

    } catch (error) {
        console.error('\n❌ ОШИБКА:');
        console.error(error);
        console.error('\nСтек ошибки:', error.stack);
        process.exit(1);
    } finally {
        await sequelize.close();
        console.log('🔌 Соединение с базой данных закрыто.\n');
        process.exit(0);
    }
}

// Запуск скрипта
createAdminWithRole();

