// tests/setup/db.js
const { sequelize } = require('../../config/database');
// Импортируем все модели чтобы Sequelize знал о них
require('../../models');

async function setupTestDb() {
    // force: true — DROP + CREATE всех таблиц. Чистая БД перед тестами.
    await sequelize.sync({ force: true });
}

async function teardownTestDb() {
    await sequelize.close();
}

module.exports = { setupTestDb, teardownTestDb, sequelize };
