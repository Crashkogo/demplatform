// tests/security/access.test.js
const request = require('supertest');
const app = require('../../app');
const { User } = require('../../models');
const { setupTestDb, teardownTestDb } = require('../setup/db');
const { createFixtures } = require('../setup/fixtures');

let fixtures;
let adminCookie;
let regularCookie;

beforeAll(async () => {
    await setupTestDb();
    fixtures = await createFixtures();

    const adminLogin = await request(app)
        .post('/api/auth/login')
        .send({ login: 'test_admin', password: 'admin_password_test' });
    const adminCookies = adminLogin.headers['set-cookie'];
    adminCookie = adminCookies ? adminCookies.join('; ') : '';

    const userLogin = await request(app)
        .post('/api/auth/login')
        .send({ login: 'test_user', password: 'user_password_test' });
    const userCookies = userLogin.headers['set-cookie'];
    regularCookie = userCookies ? userCookies.join('; ') : '';
});

afterAll(async () => {
    await teardownTestDb();
});

// Тест 7: Не-admin не может создать пользователя → 403
test('Пользователь без isAdmin не может POST /api/admin/users', async () => {
    const res = await request(app)
        .post('/api/admin/users')
        .set('Cookie', regularCookie)
        .send({ login: 'new_user', password: 'password123', roleIds: [] });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
});

// Тест 8: Пользователь без canManageRoles не может создать роль → 403
test('Пользователь без canManageRoles не может POST /api/roles', async () => {
    const res = await request(app)
        .post('/api/roles')
        .set('Cookie', regularCookie)
        .send({ name: 'Нелегальная роль', description: 'Тест' });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
});

// Тест 9: DELETE организации с прикреплёнными пользователями → 400
test('Нельзя удалить организацию если к ней привязаны пользователи', async () => {
    // Создаём организацию
    const orgRes = await request(app)
        .post('/api/organizations')
        .set('Cookie', adminCookie)
        .send({ name: 'Тест Организация', description: '' });

    expect(orgRes.status).toBe(201);
    const orgId = orgRes.body.data.id;

    // Привязываем пользователя к организации напрямую в БД
    await User.update({ organizationId: orgId }, { where: { id: fixtures.regularUser.id } });

    // Пытаемся удалить — должно вернуть 400
    const deleteRes = await request(app)
        .delete(`/api/organizations/${orgId}`)
        .set('Cookie', adminCookie);

    expect(deleteRes.status).toBe(400);
    expect(deleteRes.body.success).toBe(false);
});
