# Critical Security Tests Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Настроить тестовую инфраструктуру (Jest + Supertest) и написать 9 критических тестов безопасности.

**Architecture:** Отдельная PostgreSQL БД `consultantplus_test`. Express-приложение экспортируется из `app.js` (без `.listen()`), `server.js` его импортирует и запускает. Тесты используют Supertest + реальную БД с пересозданием таблиц перед запуском.

**Tech Stack:** Jest, Supertest, dotenv-cli, PostgreSQL (`consultantplus_test` — уже создана)

---

## Контекст

- `config/database.js` читает `POSTGRES_DB` из `process.env` — тестовая БД включается через `.env.test`
- `middleware/auth.js` кэширует пользователей в `_userCache` (Map) — после создания фикстур кэш чистый, проблем нет
- JWT payload: `{ userId, tokenVersion }`, подписывается `config.jwtSecret`
- `requireAdmin` проверяет `req.user.roles[].isAdmin` (many-to-many через `user_roles`)
- `server.js` сейчас содержит и конфигурацию app, и `listen()` — нужно разделить

---

### Task 1: Установить зависимости

**Files:**
- Modify: `package.json`

**Step 1: Установить пакеты**

```bash
npm install --save-dev jest supertest dotenv-cli
```

**Step 2: Проверить что установилось**

```bash
npm ls jest supertest dotenv-cli --depth=0
```

Ожидаем: все три пакета в `devDependencies`.

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: добавлены jest, supertest, dotenv-cli для тестов"
```

---

### Task 2: Создать .env.test

**Files:**
- Create: `.env.test`

**Step 1: Создать файл**

```bash
# .env.test
NODE_ENV=test
POSTGRES_DB=consultantplus_test
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
JWT_SECRET=test_jwt_secret_key_for_tests_only
JWT_EXPIRES_IN=1h
PORT=3001
```

Значения `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST` — скопировать из основного `.env`.

**Step 2: Добавить .env.test в .gitignore**

Проверить `.gitignore` — если `.env*` уже там есть, всё хорошо. Если нет — добавить строку `.env.test`.

**Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: добавлен .env.test для тестовой БД"
```

---

### Task 3: Извлечь Express app в app.js

**Проблема:** `server.js` одновременно конфигурирует app и вызывает `.listen()`. Supertest нужен только объект `app` — без запуска сервера.

**Files:**
- Create: `app.js`
- Modify: `server.js`

**Step 1: Создать app.js**

Скопировать из `server.js` всё между `const app = express()` и вызовом `initializeDatabase()` — то есть весь middleware и маршруты. Добавить `module.exports = app` в конце.

```javascript
// app.js
require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const path = require('path');
const os = require('os');
const jwt = require('jsonwebtoken');
const config = require('./config');

const authRoutes = require('./routes/auth');
const categoryRoutes = require('./routes/categories');
const materialRoutes = require('./routes/materials');
const adminRoutes = require('./routes/admin');
const roleRoutes = require('./routes/roles');
const articleRoutes = require('./routes/articles');
const proReviewRoutes = require('./routes/proReview');
const organizationRoutes = require('./routes/organizations');

const app = express();

if (process.env.TRUST_PROXY) {
    const proxyVal = parseInt(process.env.TRUST_PROXY);
    app.set('trust proxy', isNaN(proxyVal) ? process.env.TRUST_PROXY : proxyVal);
}

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "https://code.jquery.com", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
            scriptSrcAttr: ["'none'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "blob:", "https://cdnjs.cloudflare.com"],
            connectSrc: ["'self'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
            fontSrc: ["'self'", "https://cdn.jsdelivr.net"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'", "blob:"],
            frameSrc: ["'self'"],
            workerSrc: ["'self'", "blob:"]
        }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: "same-origin" },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    noSniff: true,
    frameguard: { action: 'deny' },
    xssFilter: true
}));

app.use((req, res, next) => {
    if (process.env.NODE_ENV === 'production' && req.header('x-forwarded-proto') !== 'https') {
        res.redirect(`https://${req.header('host')}${req.url}`);
    } else {
        next();
    }
});

const defaultOrigins = ['http://localhost:3000', 'http://127.0.0.1:3000'];
const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
    : defaultOrigins;

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

app.use('/uploads', (req, res, next) => {
    const token = req.cookies?.authToken || req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'Требуется авторизация' });
    try {
        jwt.verify(token, config.jwtSecret);
        next();
    } catch {
        return res.status(401).json({ success: false, message: 'Недействительный токен' });
    }
}, express.static(path.join(__dirname, 'uploads')));

app.use('/libs/tinymce', express.static(path.join(__dirname, 'node_modules/tinymce')));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/materials', materialRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/organizations', organizationRoutes);
app.use('/api', articleRoutes);
app.use('/api', proReviewRoutes);

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/app', (req, res) => res.sendFile(path.join(__dirname, 'public', 'app.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

app.use('*', (req, res) => {
    res.status(404).json({ success: false, message: 'Маршрут не найден' });
});

app.use((err, req, res, next) => {
    console.error('Global error handler:', err);
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Внутренняя ошибка сервера',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

module.exports = app;
```

**Step 2: Изменить server.js — заменить конфигурацию app на импорт**

В начале `server.js` убрать весь middleware/маршруты и вместо них:

```javascript
const app = require('./app');
```

`server.js` оставляет только: импорты http/https, `initializeDatabase()`, `app.listen()`.

**Step 3: Запустить сервер, убедиться что работает**

```bash
npm run dev
```

Открыть браузер, зайти на `http://localhost:3000` — всё должно работать как раньше.

**Step 4: Commit**

```bash
git add app.js server.js
git commit -m "refactor: вынесена конфигурация Express в app.js для тестирования"
```

---

### Task 4: Настроить Jest

**Files:**
- Create: `jest.config.js`
- Modify: `package.json` (scripts)

**Step 1: Создать jest.config.js**

```javascript
// jest.config.js
module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/tests/**/*.test.js'],
    setupFilesAfterFramework: [],
    testTimeout: 30000,
    verbose: true
};
```

**Step 2: Обновить package.json scripts**

```json
"test": "dotenv -e .env.test -- jest --runInBand --forceExit",
"test:watch": "dotenv -e .env.test -- jest --watch --runInBand"
```

- `--runInBand` — тесты последовательно (одна БД)
- `--forceExit` — завершить процесс после тестов (не ждать закрытия соединений)
- `dotenv -e .env.test` — загрузить тестовые переменные окружения

**Step 3: Commit**

```bash
git add jest.config.js package.json
git commit -m "chore: настроен Jest для тестирования"
```

---

### Task 5: Создать tests/setup/db.js

**Files:**
- Create: `tests/setup/db.js`

**Назначение:** Пересоздать таблицы тестовой БД перед всеми тестами, закрыть соединение после.

```javascript
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
```

**Проверка:** Файл создан, нет синтаксических ошибок:

```bash
node -e "require('./tests/setup/db')"
```

---

### Task 6: Создать tests/setup/fixtures.js

**Files:**
- Create: `tests/setup/fixtures.js`

**Назначение:** Создать тестовые данные: admin-пользователь, обычный пользователь, роли с конкретными правами.

```javascript
// tests/setup/fixtures.js
const bcrypt = require('bcrypt');
const { User, Role } = require('../../models');

async function createAdminRole() {
    return Role.create({
        name: 'Тест-Админ',
        isAdmin: true,
        canViewMaterials: true,
        canDownloadMaterials: true,
        canCreateMaterials: true,
        canEditMaterials: true,
        canDeleteMaterials: true,
        canCreateCategories: true,
        canEditCategories: true,
        canDeleteCategories: true,
        canManageAllCategories: true,
        categoryAccessType: 'all',
        canViewUsers: true,
        canCreateUsers: true,
        canEditUsers: true,
        canDeleteUsers: true,
        canViewLogs: true,
        canManageRoles: true
    });
}

async function createRegularRole() {
    return Role.create({
        name: 'Тест-Пользователь',
        isAdmin: false,
        canViewMaterials: true,
        canDownloadMaterials: false,
        canManageRoles: false,
        categoryAccessType: 'selected'
    });
}

async function createAdminUser(adminRole) {
    const hashedPassword = await bcrypt.hash('admin_password_test', 10);
    const user = await User.create({
        login: 'test_admin',
        password: hashedPassword,
        tokenVersion: 0
    });
    await user.setRoles([adminRole.id]);
    // Перезагрузить с ролями
    return User.findByPk(user.id, {
        include: [{ model: Role, as: 'roles', through: { attributes: [] } }]
    });
}

async function createRegularUser(regularRole) {
    const hashedPassword = await bcrypt.hash('user_password_test', 10);
    const user = await User.create({
        login: 'test_user',
        password: hashedPassword,
        tokenVersion: 0
    });
    await user.setRoles([regularRole.id]);
    return User.findByPk(user.id, {
        include: [{ model: Role, as: 'roles', through: { attributes: [] } }]
    });
}

async function createFixtures() {
    const adminRole = await createAdminRole();
    const regularRole = await createRegularRole();
    const adminUser = await createAdminUser(adminRole);
    const regularUser = await createRegularUser(regularRole);
    return { adminRole, regularRole, adminUser, regularUser };
}

module.exports = { createFixtures };
```

---

### Task 7: Написать тесты аутентификации (tests 1-4)

**Files:**
- Create: `tests/security/auth.test.js`

```javascript
// tests/security/auth.test.js
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../app');
const { setupTestDb, teardownTestDb } = require('../setup/db');
const { createFixtures } = require('../setup/fixtures');

let fixtures;

beforeAll(async () => {
    await setupTestDb();
    fixtures = await createFixtures();
});

afterAll(async () => {
    await teardownTestDb();
});

// Тест 1: Логин с верным паролем → 200 + токен
test('Логин с верным паролем возвращает 200 и токен', async () => {
    const res = await request(app)
        .post('/api/auth/login')
        .send({ login: 'test_admin', password: 'admin_password_test' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('token');
    expect(typeof res.body.data.token).toBe('string');
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
```

**Step 1: Запустить тесты**

```bash
npm test -- tests/security/auth.test.js
```

Ожидаем: все 4 теста зелёные.

**Step 2: Commit**

```bash
git add tests/security/auth.test.js tests/setup/db.js tests/setup/fixtures.js
git commit -m "test: критические тесты аутентификации (тесты 1-4)"
```

---

### Task 8: Написать тесты mass assignment (tests 5-6)

**Files:**
- Create: `tests/security/mass-assign.test.js`

```javascript
// tests/security/mass-assign.test.js
const request = require('supertest');
const app = require('../../app');
const { Role } = require('../../models');
const { setupTestDb, teardownTestDb } = require('../setup/db');
const { createFixtures } = require('../setup/fixtures');

let fixtures;
let adminToken;

beforeAll(async () => {
    await setupTestDb();
    fixtures = await createFixtures();

    // Получаем токен администратора через API
    const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ login: 'test_admin', password: 'admin_password_test' });
    adminToken = loginRes.body.data.token;
});

afterAll(async () => {
    await teardownTestDb();
});

// Тест 5: POST /api/roles с isAdmin:true в теле → isAdmin остаётся false
test('POST /api/roles с isAdmin:true в теле — isAdmin не устанавливается', async () => {
    const res = await request(app)
        .post('/api/roles')
        .set('Authorization', `Bearer ${adminToken}`)
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
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Обычная роль', description: 'Тест', canViewMaterials: false });

    expect(createRes.status).toBe(201);
    const roleId = createRes.body.data.id;

    // Пытаемся через PUT сделать её admin
    const updateRes = await request(app)
        .put(`/api/roles/${roleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
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
```

**Step 1: Запустить тесты**

```bash
npm test -- tests/security/mass-assign.test.js
```

Ожидаем: оба теста зелёные. Если красные — уязвимость C1 ещё не исправлена.

**Step 2: Commit**

```bash
git add tests/security/mass-assign.test.js
git commit -m "test: критические тесты mass assignment C1 (тесты 5-6)"
```

---

### Task 9: Написать тесты контроля доступа (tests 7-9)

**Files:**
- Create: `tests/security/access.test.js`

```javascript
// tests/security/access.test.js
const request = require('supertest');
const app = require('../../app');
const { Organization, User } = require('../../models');
const { setupTestDb, teardownTestDb } = require('../setup/db');
const { createFixtures } = require('../setup/fixtures');

let fixtures;
let adminToken;
let regularToken;

beforeAll(async () => {
    await setupTestDb();
    fixtures = await createFixtures();

    const adminLogin = await request(app)
        .post('/api/auth/login')
        .send({ login: 'test_admin', password: 'admin_password_test' });
    adminToken = adminLogin.body.data.token;

    const userLogin = await request(app)
        .post('/api/auth/login')
        .send({ login: 'test_user', password: 'user_password_test' });
    regularToken = userLogin.body.data.token;
});

afterAll(async () => {
    await teardownTestDb();
});

// Тест 7: Не-admin не может создать пользователя → 403
test('Пользователь без isAdmin не может POST /api/admin/users', async () => {
    const res = await request(app)
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${regularToken}`)
        .send({ login: 'new_user', password: 'password123', roleIds: [] });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
});

// Тест 8: Пользователь без canManageRoles не может создать роль → 403
test('Пользователь без canManageRoles не может POST /api/roles', async () => {
    const res = await request(app)
        .post('/api/roles')
        .set('Authorization', `Bearer ${regularToken}`)
        .send({ name: 'Нелегальная роль', description: 'Тест' });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
});

// Тест 9: DELETE организации с прикреплёнными пользователями → 400
test('Нельзя удалить организацию если к ней привязаны пользователи', async () => {
    // Создаём организацию
    const orgRes = await request(app)
        .post('/api/organizations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Тест Организация', description: '' });

    expect(orgRes.status).toBe(201);
    const orgId = orgRes.body.data.id;

    // Привязываем пользователя к организации
    await User.update({ organizationId: orgId }, { where: { id: fixtures.regularUser.id } });

    // Пытаемся удалить — должно вернуть 400
    const deleteRes = await request(app)
        .delete(`/api/organizations/${orgId}`)
        .set('Authorization', `Bearer ${adminToken}`);

    expect(deleteRes.status).toBe(400);
    expect(deleteRes.body.success).toBe(false);
});
```

**Step 1: Запустить тесты**

```bash
npm test -- tests/security/access.test.js
```

Ожидаем: все 3 теста зелёные.

**Step 2: Запустить все тесты вместе**

```bash
npm test
```

Ожидаем: все 9 тестов зелёные.

**Step 3: Commit**

```bash
git add tests/security/access.test.js
git commit -m "test: критические тесты контроля доступа (тесты 7-9)"
```

---

## Итог

После выполнения всех задач:
- `npm test` — запускает все 9 тестов за ~10-15 секунд
- Тесты работают с `consultantplus_test`, основная БД не трогается
- При любом изменении кода безопасности — запускаешь `npm test` и сразу видишь регрессии
