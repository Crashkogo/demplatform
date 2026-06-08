// tests/api/materials.test.js
const request = require('supertest');
const app = require('../../app');
const { Material } = require('../../models');
const { setupTestDb } = require('../setup/db');
const { createFixtures } = require('../setup/fixtures');

let fixtures;
let adminCookie;
let regularCookie;
let testCategory;

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

    // Создаём тестовую категорию через API
    const catRes = await request(app)
        .post('/api/categories')
        .set('Cookie', adminCookie)
        .send({ name: 'Тест-категория материалов', order: 0 });
    testCategory = catRes.body.data;
});

test('POST /api/materials загружает файл и создаёт материал', async () => {
    const fileBuffer = Buffer.from('Тестовый файл содержимое', 'utf-8');

    const res = await request(app)
        .post('/api/materials')
        .set('Cookie', adminCookie)
        .field('title', 'Тест Материал')
        .field('description', 'Описание')
        .field('categoryId', testCategory.id.toString())
        .attach('file', fileBuffer, { filename: 'test.txt', contentType: 'text/plain' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.title).toBe('Тест Материал');
    expect(res.body.data.categoryId).toBe(testCategory.id);
});

test('POST /api/materials без файла → 400', async () => {
    const res = await request(app)
        .post('/api/materials')
        .set('Cookie', adminCookie)
        .field('title', 'Без файла')
        .field('categoryId', testCategory.id.toString());

    expect(res.status).toBe(400);
});

test('POST /api/materials без canCreateMaterials → 403', async () => {
    const fileBuffer = Buffer.from('content', 'utf-8');

    const res = await request(app)
        .post('/api/materials')
        .set('Cookie', regularCookie)
        .field('title', 'Запрещённый')
        .field('categoryId', testCategory.id.toString())
        .attach('file', fileBuffer, { filename: 'test.txt', contentType: 'text/plain' });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
});

test('GET /api/materials возвращает список материалов', async () => {
    const res = await request(app)
        .get('/api/materials')
        .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
});

test('DELETE /api/materials/:id удаляет материал', async () => {
    const fileBuffer = Buffer.from('delete me', 'utf-8');
    const createRes = await request(app)
        .post('/api/materials')
        .set('Cookie', adminCookie)
        .field('title', 'Материал для удаления')
        .field('categoryId', testCategory.id.toString())
        .attach('file', fileBuffer, { filename: 'delete.txt', contentType: 'text/plain' });

    expect(createRes.status).toBe(201);
    const materialId = createRes.body.data.id;

    const deleteRes = await request(app)
        .delete(`/api/materials/${materialId}`)
        .set('Cookie', adminCookie);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.success).toBe(true);

    const deleted = await Material.findByPk(materialId);
    expect(deleted).toBeNull();
});
