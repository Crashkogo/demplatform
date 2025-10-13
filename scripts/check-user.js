// scripts/check-user.js
// Скрипт для проверки пользователя

const { sequelize, User, Role } = require('../models');

async function checkUser() {
    try {
        console.log('🔄 Подключение к базе данных...');
        await sequelize.authenticate();

        const login = process.argv[2] || 'admin';

        const user = await User.findOne({
            where: { login },
            include: [{ model: Role, as: 'roleData' }]
        });

        if (!user) {
            console.log(`❌ Пользователь "${login}" не найден`);
            process.exit(1);
        }

        console.log('\n👤 Информация о пользователе:');
        console.log(`   ID: ${user.id}`);
        console.log(`   Логин: ${user.login}`);
        console.log(`   roleId: ${user.roleId}`);

        if (user.roleData) {
            console.log(`\n📋 Роль:`);
            console.log(`   ID: ${user.roleData.id}`);
            console.log(`   Название: ${user.roleData.name}`);
            console.log(`   isAdmin: ${user.roleData.isAdmin ? '✅' : '❌'}`);
        } else {
            console.log(`\n⚠️  Роль не найдена!`);
        }

        console.log(`\n✅ Все данные корректны`);

        process.exit(0);
    } catch (error) {
        console.error('❌ Ошибка:', error);
        process.exit(1);
    }
}

checkUser();

