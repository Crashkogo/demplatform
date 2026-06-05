const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const os = require('os');

// Автоприменение изменений в development режиме
if (process.env.NODE_ENV !== 'production') {
    try {
        const { autoApplyChanges } = require('./auto-apply');
        autoApplyChanges();
    } catch (error) {
        console.log('📝 Автоприменение недоступно (это нормально в production)');
    }
}

const app = require('./app');

// Импорт конфигурации
const config = require('./config');

// Проверка критических настроек в production
if (process.env.NODE_ENV === 'production') {
    const jwtSecret = config.jwtSecret;
    const isDefaultSecret = jwtSecret === 'your_super_secret_jwt_key_change_in_production';
    if (isDefaultSecret || jwtSecret.length < 10) {
        console.error('❌ КРИТИЧЕСКАЯ ОШИБКА: JWT_SECRET не задан или слишком короткий (минимум 10 символов).');
        console.error('   Задайте переменную окружения JWT_SECRET в файле .env');
        process.exit(1);
    }
}

// Импорт моделей и подключения к базе данных
const { sequelize, User, Category, Material } = require('./models');
const { testConnection, syncDatabase } = require('./config/database');

// Функция для получения локального IP адреса (используется в стартовых логах)
function getLocalIPAddress() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

// Функция инициализации базы данных
const initializeDatabase = async () => {
    try {
        console.log('🔗 Подключение к PostgreSQL...');

        // Тестируем подключение к базе данных
        const connectionSuccess = await testConnection();
        if (!connectionSuccess) {
            throw new Error('Не удалось подключиться к PostgreSQL');
        }

        // Синхронизируем модели с базой данных
        console.log('🔄 Синхронизация моделей с базой данных...');
        // В production только проверяем что таблицы существуют, не меняем схему
        const alterSchema = process.env.NODE_ENV !== 'production';
        await syncDatabase({ alter: alterSchema });

        console.log('✅ База данных PostgreSQL готова к работе');

        // Создаем роль Администратор по умолчанию
        const { Role } = require('./models');
        let adminRole = await Role.findOne({ where: { isAdmin: true } });

        if (!adminRole) {
            adminRole = await Role.create({
                name: 'Администратор',
                description: 'Полный доступ ко всем функциям системы',
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
            console.log('✅ Создана роль "Администратор"');
        }

        // Создаем пользователя администратора по умолчанию
        const adminExists = await User.findOne({ where: { login: config.defaultAdmin.login } });
        if (!adminExists) {
            const defaultAdmin = await User.create({
                login: config.defaultAdmin.login,
                password: config.defaultAdmin.password
            });
            await defaultAdmin.setRoles([adminRole.id]);

            console.log(`👤 Создан администратор по умолчанию: ${config.defaultAdmin.login}`);
        }

        // Создаем корневые категории для демонстрации
        const rootCategoriesCount = await Category.count({ where: { parentId: null } });
        if (rootCategoriesCount === 0) {
            const demoCategories = [
                { name: 'Документы', description: 'Различные документы и файлы' },
                { name: 'Видео', description: 'Видео материалы' },
                { name: 'Изображения', description: 'Картинки и фотографии' },
                { name: 'Обучение', description: 'Учебные материалы' }
            ];

            for (const categoryData of demoCategories) {
                await Category.create(categoryData);
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
                console.log(`👤 Логин администратора: ${config.defaultAdmin.login}`);
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
                console.log(`👤 Логин администратора: ${config.defaultAdmin.login}`);
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
                sequelize.close().then(() => {
                    console.log('📊 Соединение с PostgreSQL закрыто');
                    process.exit(0);
                });
            });
        });

        process.on('SIGINT', () => {
            console.log('📤 Получен сигнал SIGINT, завершение работы...');
            server.close(() => {
                console.log('🔌 HTTP сервер закрыт');
                sequelize.close().then(() => {
                    console.log('📊 Соединение с PostgreSQL закрыто');
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