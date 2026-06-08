// tests/api/roles.test.js
const request = require('supertest');
const app = require('../../app');
const { Role } = require('../../models');
const { setupTestDb } = require('../setup/db');
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
    adminCookie = adminLogin.headers['set-cookie'].join('; ');

    const userLogin = await request(app)
        .post('/api/auth/login')
        .send({ login: 'test_user', password: 'user_password_test' });
    regularCookie = userLogin.headers['set-cookie'].join('; ');
});

test('GET /api/roles возвращает список ролей', async () => {
    const res = await request(app)
        .get('/api/roles')
        .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2); // минимум adminRole и regularRole из фикстур
});

test('POST /api/roles создаёт роль', async () => {
    const res = await request(app)
        .post('/api/roles')
        .set('Cookie', adminCookie)
        .send({ name: 'Новая роль', description: 'Тест', canViewMaterials: true });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Новая роль');
    expect(res.body.data.isAdmin).toBe(false); // isAdmin всегда false при создании через тело запроса
});

test('POST /api/roles без canManageRoles → 403', async () => {
    const res = await request(app)
        .post('/api/roles')
        .set('Cookie', regularCookie)
        .send({ name: 'Запрещённая роль' });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
});

test('PUT /api/roles/:id обновляет роль', async () => {
    const createRes = await request(app)
        .post('/api/roles')
        .set('Cookie', adminCookie)
        .send({ name: 'Роль для редактирования' });
    const roleId = createRes.body.data.id;

    const res = await request(app)
        .put(`/api/roles/${roleId}`)
        .set('Cookie', adminCookie)
        .send({ name: 'Переименована', canViewMaterials: true });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const updated = await Role.findByPk(roleId);
    expect(updated.name).toBe('Переименована');
});

test('DELETE /api/roles/:id удаляет роль без пользователей', async () => {
    const createRes = await request(app)
        .post('/api/roles')
        .set('Cookie', adminCookie)
        .send({ name: 'Роль для удаления' });
    const roleId = createRes.body.data.id;

    const res = await request(app)
        .delete(`/api/roles/${roleId}`)
        .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const deleted = await Role.findByPk(roleId);
    expect(deleted).toBeNull();
});
