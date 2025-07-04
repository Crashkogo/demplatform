// Загрузка переменных окружения из .env файла
require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const http = require('http');

// Автоприменение изменений в development режиме
if (process.env.NODE_ENV !== 'production') {
    try {
        const { autoApplyChanges } = require('./auto-apply');
        autoApplyChanges();
    } catch (error) {
        console.log('📝 Автоприменение недоступно (это нормально в production)');
    }
}

// Импорт конфигурации
const config = require('./config');

// Импорт моделей
const User = require('./models/User');
const Category = require('./models/Category');

// Импорт маршрутов
const authRoutes = require('./routes/auth');
const categoryRoutes = require('./routes/categories');
const materialRoutes = require('./routes/materials');
const adminRoutes = require('./routes/admin');

const app = express();

// Функция для получения локального IP адреса
function getLocalIPAddress() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // Пропускаем loopback и non-IPv4 адреса
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

// Middleware для безопасности
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: [
                "'self'",
                "'unsafe-inline'", // Временно для CDN скриптов
                "https://code.jquery.com",
                "https://cdn.jsdelivr.net",
                "https://cdnjs.cloudflare.com"
            ],
            styleSrc: [
                "'self'",
                "'unsafe-inline'",
                "https://cdn.jsdelivr.net",
                "https://cdnjs.cloudflare.com"
            ],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: ["'self'"],
            fontSrc: [
                "'self'",
                "https://cdn.jsdelivr.net"
            ],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'", "blob:"],
            frameSrc: ["'self'"]
        }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: "same-origin" },
    hsts: {
        maxAge: 31536000, // 1 год
        includeSubDomains: true,
        preload: true
    },
    noSniff: true,
    frameguard: { action: 'deny' },
    xssFilter: true
}));

// Получаем локальный IP адрес
const localIP = getLocalIPAddress();

// Middleware для принудительного перенаправления на HTTPS
app.use((req, res, next) => {
    // В продакшене принудительно перенаправляем на HTTPS
    if (process.env.NODE_ENV === 'production' && req.header('x-forwarded-proto') !== 'https') {
        res.redirect(`https://${req.header('host')}${req.url}`);
    } else {
        next();
    }
});

// CORS
app.use(cors({
    origin: [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        `http://${localIP}:3000`,
        'https://localhost:3000',
        'https://127.0.0.1:3000',
        `https://${localIP}:3000`
    ],
    credentials: true
}));

// Парсинг JSON
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Статические файлы
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// API маршруты
app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/materials', materialRoutes);
app.use('/api/admin', adminRoutes);

// Основные HTML страницы
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/app', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'app.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Обработка 404
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'Маршрут не найден'
    });
});

// Глобальный обработчик ошибок
app.use((err, req, res, next) => {
    console.error('Global error handler:', err);

    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Внутренняя ошибка сервера',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// Функция инициализации базы данных
const initializeDatabase = async () => {
    try {
        console.log('🔗 Подключение к MongoDB...');

        await mongoose.connect(config.mongodbUri, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });

        console.log('✅ Подключение к MongoDB установлено');

        // Создаем администратора по умолчанию
        const adminExists = await User.findOne({ role: 'admin' });
        if (!adminExists) {
            const defaultAdmin = new User({
                login: config.defaultAdmin.login,
                password: config.defaultAdmin.password,
                role: 'admin'
            });

            await defaultAdmin.save();
            console.log(`👤 Создан администратор по умолчанию: ${config.defaultAdmin.login}`);
        }

        // Создаем корневые категории для демонстрации
        const rootCategoriesCount = await Category.countDocuments({ parentId: null });
        if (rootCategoriesCount === 0) {
            const demoCategories = [
                { name: 'Документы', description: 'Различные документы и файлы' },
                { name: 'Видео', description: 'Видео материалы' },
                { name: 'Изображения', description: 'Картинки и фотографии' },
                { name: 'Обучение', description: 'Учебные материалы' }
            ];

            for (const categoryData of demoCategories) {
                const category = new Category(categoryData);
                await category.save();
            }

            console.log('📁 Созданы демонстрационные категории');
        }

        // Создаем папку для загрузок
        const uploadsDir = config.uploadsPath;
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
            console.log('📂 Создана папка для загрузок');
        }

    } catch (error) {
        console.error('❌ Ошибка инициализации базы данных:', error);
        process.exit(1);
    }
};

// Функция запуска сервера
const startServer = async () => {
    try {
        await initializeDatabase();

        let server;

        // Проверяем, нужно ли использовать HTTPS
        if (config.ssl.enabled && fs.existsSync(config.ssl.keyPath) && fs.existsSync(config.ssl.certPath)) {
            // HTTPS сервер
            const options = {
                key: fs.readFileSync(config.ssl.keyPath),
                cert: fs.readFileSync(config.ssl.certPath)
            };

            server = https.createServer(options, app).listen(config.port, config.host, () => {
                console.log('🚀 HTTPS Сервер запущен');
                console.log(`🔒 Локальный URL: https://localhost:${config.port}`);
                console.log(`🌐 Сетевой URL: https://${localIP}:${config.port}`);
                console.log(`👤 Админ: ${config.defaultAdmin.login} / ${config.defaultAdmin.password}`);
                console.log('📋 Доступные страницы:');
                console.log(`   • Главная (логин): https://${localIP}:${config.port}/`);
                console.log(`   • Приложение: https://${localIP}:${config.port}/app`);
                console.log(`   • Админ-панель: https://${localIP}:${config.port}/admin`);
                console.log('🔗 API endpoints:');
                console.log(`   • Auth: https://${localIP}:${config.port}/api/auth`);
                console.log(`   • Categories: https://${localIP}:${config.port}/api/categories`);
                console.log(`   • Materials: https://${localIP}:${config.port}/api/materials`);
                console.log(`   • Admin: https://${localIP}:${config.port}/api/admin`);
            });

            // Также запускаем HTTP сервер для перенаправления на HTTPS
            http.createServer((req, res) => {
                res.writeHead(301, { "Location": "https://" + req.headers['host'] + req.url });
                res.end();
            }).listen(80, () => {
                console.log('🔄 HTTP сервер перенаправляет на HTTPS (порт 80)');
            }).on('error', (err) => {
                if (err.code === 'EACCES') {
                    console.log('⚠️  Нет прав для привязки к порту 80 (требуются права администратора)');
                }
            });

        } else {
            // HTTP сервер (для разработки)
            server = http.createServer(app).listen(config.port, config.host, () => {
                console.log('🚀 HTTP Сервер запущен');
                console.log(`📍 Локальный URL: http://localhost:${config.port}`);
                console.log(`🌐 Сетевой URL: http://${localIP}:${config.port}`);
                console.log(`👤 Админ: ${config.defaultAdmin.login} / ${config.defaultAdmin.password}`);
                console.log('📋 Доступные страницы:');
                console.log(`   • Главная (логин): http://${localIP}:${config.port}/`);
                console.log(`   • Приложение: http://${localIP}:${config.port}/app`);
                console.log(`   • Админ-панель: http://${localIP}:${config.port}/admin`);
                console.log('🔗 API endpoints:');
                console.log(`   • Auth: http://${localIP}:${config.port}/api/auth`);
                console.log(`   • Categories: http://${localIP}:${config.port}/api/categories`);
                console.log(`   • Materials: http://${localIP}:${config.port}/api/materials`);
                console.log(`   • Admin: http://${localIP}:${config.port}/api/admin`);
                console.log('');
                console.log('💡 Для включения HTTPS выполните:');
                console.log('   node generate-ssl.js');
                console.log('   SSL_ENABLED=true npm start');
            });
        }

        // Graceful shutdown
        process.on('SIGTERM', () => {
            console.log('📤 Получен сигнал SIGTERM, завершение работы...');
            server.close(() => {
                console.log('🔌 HTTP сервер закрыт');
                mongoose.connection.close(false, () => {
                    console.log('📊 Соединение с MongoDB закрыто');
                    process.exit(0);
                });
            });
        });

        process.on('SIGINT', () => {
            console.log('📤 Получен сигнал SIGINT, завершение работы...');
            server.close(() => {
                console.log('🔌 HTTP сервер закрыт');
                mongoose.connection.close(false, () => {
                    console.log('📊 Соединение с MongoDB закрыто');
                    process.exit(0);
                });
            });
        });

    } catch (error) {
        console.error('❌ Ошибка запуска сервера:', error);
        process.exit(1);
    }
};

// Запуск сервера
startServer();

module.exports = app; 