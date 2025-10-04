/**
 * Скрипт для полного сброса базы данных
 * ВНИМАНИЕ: Удаляет все данные!
 * 
 * Использование:
 * node scripts/reset-db.js
 */

require('dotenv').config();
const { sequelize } = require('../models');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query) => {
    return new Promise(resolve => rl.question(query, resolve));
};

const resetDatabase = async () => {
    try {
        console.log('⚠️  ВНИМАНИЕ: Вы собираетесь ПОЛНОСТЬЮ ОЧИСТИТЬ базу данных!');
        console.log('⚠️  Все данные будут безвозвратно удалены!\n');

        const answer = await question('Вы уверены? Введите "yes" для подтверждения: ');

        if (answer.toLowerCase() !== 'yes') {
            console.log('\n❌ Операция отменена');
            rl.close();
            process.exit(0);
        }

        console.log('\n🔗 Подключение к PostgreSQL...');
        await sequelize.authenticate();
        console.log('✅ Подключение установлено\n');

        console.log('🗑️  Удаление всех таблиц...');
        await sequelize.drop();
        console.log('✅ Все таблицы удалены\n');

        console.log('✅ База данных полностью очищена!\n');
        console.log('💡 Следующие шаги:');
        console.log('   1. npm run migrate - создать таблицы');
        console.log('   2. npm run seed - заполнить начальными данными\n');

        rl.close();
        process.exit(0);
    } catch (error) {
        console.error('❌ Ошибка сброса базы данных:', error.message);
        console.error('\n📋 Детали ошибки:', error);
        rl.close();
        process.exit(1);
    }
};

// Запускаем сброс
resetDatabase();
