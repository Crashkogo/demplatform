// tests/api/organizations.test.js
const request = require('supertest');
const app = require('../../app');
const { Organization } = require('../../models');
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

test('GET /api/organizations доступен любому авторизованному', async () => {
    const res = await request(app)
        .get('/api/organizations')
        .set('Cookie', regularCookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
});

test('GET /api/organizations возвращает userCount и roleCount', async () => {
    await Organization.create({ name: 'Орг с счётчиками' });

    const res = await request(app)
        .get('/api/organizations')
        .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    const org = res.body.data.find(o => o.name === 'Орг с счётчиками');
    expect(org).toBeDefined();
    expect(typeof org.userCount).toBe('number');
    expect(typeof org.roleCount).toBe('number');
});

test('POST /api/organizations создаёт организацию', async () => {
    const res = await request(app)
        .post('/api/organizations')
        .set('Cookie', adminCookie)
        .send({ name: 'Новая организация', description: 'Описание' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Новая организация');
});

test('POST /api/organizations без isAdmin → 403', async () => {
    const res = await request(app)
        .post('/api/organizations')
        .set('Cookie', regularCookie)
        .send({ name: 'Запрещённая' });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
});

test('PUT /api/organizations/:id обновляет организацию', async () => {
    const createRes = await request(app)
        .post('/api/organizations')
        .set('Cookie', adminCookie)
        .send({ name: 'Для редактирования' });
    const orgId = createRes.body.data.id;

    const res = await request(app)
        .put(`/api/organizations/${orgId}`)
        .set('Cookie', adminCookie)
        .send({ name: 'Переименована' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const updated = await Organization.findByPk(orgId);
    expect(updated.name).toBe('Переименована');
});

test('DELETE /api/organizations/:id удаляет пустую организацию', async () => {
    const createRes = await request(app)
        .post('/api/organizations')
        .set('Cookie', adminCookie)
        .send({ name: 'Для удаления' });
    const orgId = createRes.body.data.id;

    const res = await request(app)
        .delete(`/api/organizations/${orgId}`)
        .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const deleted = await Organization.findByPk(orgId);
    expect(deleted).toBeNull();
});
