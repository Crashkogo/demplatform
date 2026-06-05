// tests/security/auth.test.js
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../app');
const { setupTestDb } = require('../setup/db');
const { createFixtures } = require('../setup/fixtures');

let fixtures;

beforeAll(async () => {
    await setupTestDb();
    fixtures = await createFixtures();
});

// Тест 1: Логин с верным паролем → 200 + токен (в cookie authToken)
test('Логин с верным паролем возвращает 200 и токен', async () => {
    const res = await request(app)
        .post('/api/auth/login')
        .send({ login: 'test_admin', password: 'admin_password_test' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Токен устанавливается в cookie authToken, а не в теле ответа
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const authCookie = cookies.find(c => c.startsWith('authToken='));
    expect(authCookie).toBeDefined();
    const tokenValue = authCookie.split('=')[1].split(';')[0];
    expect(tokenValue.length).toBeGreaterThan(20);
});

// Тест 2: Логин с неверным паролем → 401
test('Логин с неверным паролем возвращает 401', async () => {
    const res = await request(app)
        .post('/api/auth/login')
        .send({ login: 'test_admin', password: 'wrong_password' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
});

// Тест 3: GET /api/auth/me без токена → 401
test('GET /api/auth/me без токена возвращает 401', async () => {
    const res = await request(app)
        .get('/api/auth/me');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
});

// Тест 4: GET /api/auth/me с истёкшим токеном → 401
test('GET /api/auth/me с истёкшим токеном возвращает 401', async () => {
    const config = require('../../config');
    // Создаём токен с истёкшим сроком (-1 секунда)
    const expiredToken = jwt.sign(
        { userId: fixtures.adminUser.id, tokenVersion: 0 },
        config.jwtSecret,
        { expiresIn: -1 }
    );

    const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
});
