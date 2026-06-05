// tests/security/mass-assign.test.js
const request = require('supertest');
const app = require('../../app');
const { Role } = require('../../models');
const { setupTestDb, teardownTestDb } = require('../setup/db');
const { createFixtures } = require('../setup/fixtures');

let fixtures;
let adminCookie; // Login uses cookies, not bearer tokens

beforeAll(async () => {
    await setupTestDb();
    fixtures = await createFixtures();

    // Получаем cookie администратора через API
    const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ login: 'test_admin', password: 'admin_password_test' });

    // Extract the auth cookie from response
    const cookies = loginRes.headers['set-cookie'];
    adminCookie = cookies ? cookies.join('; ') : '';
});

afterAll(async () => {
    await teardownTestDb();
});

// Тест 5: POST /api/roles с isAdmin:true в теле → isAdmin остаётся false
test('POST /api/roles с isAdmin:true в теле — isAdmin не устанавливается', async () => {
    const res = await request(app)
        .post('/api/roles')
        .set('Cookie', adminCookie)
        .send({
            name: 'Попытка взлома',
            description: 'Тест',
            isAdmin: true,          // злонамеренное поле
            canViewMaterials: true
        });

    expect(res.status).toBe(201);

    // Проверяем в БД что isAdmin действительно false
    const role = await Role.findOne({ where: { name: 'Попытка взлома' } });
    expect(role).not.toBeNull();
    expect(role.isAdmin).toBe(false);
});

// Тест 6: PUT /api/roles/:id с isAdmin:true → не применяется
test('PUT /api/roles/:id с isAdmin:true в теле — isAdmin не меняется', async () => {
    // Создаём обычную роль
    const createRes = await request(app)
        .post('/api/roles')
        .set('Cookie', adminCookie)
        .send({ name: 'Обычная роль', description: 'Тест', canViewMaterials: false });

    expect(createRes.status).toBe(201);
    const roleId = createRes.body.data.id;

    // Пытаемся через PUT сделать её admin
    const updateRes = await request(app)
        .put(`/api/roles/${roleId}`)
        .set('Cookie', adminCookie)
        .send({
            name: 'Обычная роль',
            description: 'Тест',
            isAdmin: true           // злонамеренное поле
        });

    expect(updateRes.status).toBe(200);

    // Проверяем в БД
    const role = await Role.findByPk(roleId);
    expect(role.isAdmin).toBe(false);
});
