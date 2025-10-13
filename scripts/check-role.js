// scripts/check-role.js
// Скрипт для проверки прав роли

const { sequelize, Role } = require('../models');

async function checkRole() {
    try {
        console.log('🔄 Подключение к базе данных...');
        await sequelize.authenticate();

        const roleId = process.argv[2] || 1;

        const role = await Role.findByPk(roleId);

        if (!role) {
            console.log(`❌ Роль с ID ${roleId} не найдена`);
            process.exit(1);
        }

        console.log('\n📋 Информация о роли:');
        console.log(`   ID: ${role.id}`);
        console.log(`   Название: ${role.name}`);
        console.log(`   Описание: ${role.description || 'не указано'}`);
        console.log(`\n🔑 Права:`);
        console.log(`   isAdmin: ${role.isAdmin ? '✅' : '❌'}`);
        console.log(`\n📄 Материалы:`);
        console.log(`   canViewMaterials: ${role.canViewMaterials ? '✅' : '❌'}`);
        console.log(`   canDownloadMaterials: ${role.canDownloadMaterials ? '✅' : '❌'}`);
        console.log(`   canCreateMaterials: ${role.canCreateMaterials ? '✅' : '❌'}`);
        console.log(`   canEditMaterials: ${role.canEditMaterials ? '✅' : '❌'}`);
        console.log(`   canDeleteMaterials: ${role.canDeleteMaterials ? '✅' : '❌'}`);
        console.log(`\n📁 Категории:`);
        console.log(`   canCreateCategories: ${role.canCreateCategories ? '✅' : '❌'}`);
        console.log(`   canEditCategories: ${role.canEditCategories ? '✅' : '❌'}`);
        console.log(`   canDeleteCategories: ${role.canDeleteCategories ? '✅' : '❌'}`);
        console.log(`   canManageAllCategories: ${role.canManageAllCategories ? '✅' : '❌'}`);
        console.log(`   categoryAccessType: ${role.categoryAccessType}`);
        console.log(`\n👥 Пользователи:`);
        console.log(`   canViewUsers: ${role.canViewUsers ? '✅' : '❌'}`);
        console.log(`   canCreateUsers: ${role.canCreateUsers ? '✅' : '❌'}`);
        console.log(`   canEditUsers: ${role.canEditUsers ? '✅' : '❌'}`);
        console.log(`   canDeleteUsers: ${role.canDeleteUsers ? '✅' : '❌'}`);
        console.log(`\n🔧 Дополнительно:`);
        console.log(`   canViewLogs: ${role.canViewLogs ? '✅' : '❌'}`);
        console.log(`   canManageRoles: ${role.canManageRoles ? '✅' : '❌'}`);

        process.exit(0);
    } catch (error) {
        console.error('❌ Ошибка:', error);
        process.exit(1);
    }
}

checkRole();

