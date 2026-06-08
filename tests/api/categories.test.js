// tests/api/categories.test.js
const request = require('supertest');
const app = require('../../app');
const { Category } = require('../../models');
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

test('GET /api/categories возвращает список категорий', async () => {
    // Создаём категорию через API чтобы список не был пустым
    await request(app)
        .post('/api/categories')
        .set('Cookie', adminCookie)
        .send({ name: 'Тест-категория', order: 0 });

    const res = await request(app)
        .get('/api/categories')
        .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
});

test('POST /api/categories создаёт категорию', async () => {
    const res = await request(app)
        .post('/api/categories')
        .set('Cookie', adminCookie)
        .send({ name: 'Новая категория', description: 'Описание', order: 0 });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Новая категория');
});

test('POST /api/categories без canCreateCategories → 403', async () => {
    const res = await request(app)
        .post('/api/categories')
        .set('Cookie', regularCookie)
        .send({ name: 'Запрещённая', order: 0 });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
});

test('PUT /api/categories/:id обновляет категорию', async () => {
    const createRes = await request(app)
        .post('/api/categories')
        .set('Cookie', adminCookie)
        .send({ name: 'Для редактирования', order: 0 });
    const catId = createRes.body.data.id;

    const res = await request(app)
        .put(`/api/categories/${catId}`)
        .set('Cookie', adminCookie)
        .send({ name: 'Переименована', order: 0 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const updated = await Category.findByPk(catId);
    expect(updated.name).toBe('Переименована');
});

test('DELETE /api/categories/:id удаляет пустую категорию', async () => {
    const createRes = await request(app)
        .post('/api/categories')
        .set('Cookie', adminCookie)
        .send({ name: 'Для удаления', order: 0 });
    const catId = createRes.body.data.id;

    const res = await request(app)
        .delete(`/api/categories/${catId}`)
        .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const deleted = await Category.findByPk(catId);
    expect(deleted).toBeNull();
});

test('GET /api/categories без авторизации → 401', async () => {
    const res = await request(app).get('/api/categories');
    expect(res.status).toBe(401);
});
