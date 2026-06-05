// app.js — конфигурация Express приложения (без запуска сервера)
// Импортируется в server.js для production и в тестах напрямую
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

// Получаем локальный IP адрес
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

const localIP = getLocalIPAddress();
const defaultOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    `http://${localIP}:3000`,
    'https://localhost:3000',
    'https://127.0.0.1:3000',
    `https://${localIP}:3000`
];
const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
    : defaultOrigins;

app.use(cors({ origin: allowedOrigins, credentials: true }));

app.use(compression({
    filter: (req, res) => {
        if (req.headers['x-no-compression'] ||
            res.getHeader('Content-Type')?.includes('video/') ||
            res.getHeader('Content-Type')?.includes('image/') ||
            res.getHeader('Content-Type')?.includes('application/octet-stream')) {
            return false;
        }
        return compression.filter(req, res);
    }
}));

if (process.env.NODE_ENV === 'development') {
    app.use((req, res, next) => {
        const start = Date.now();
        res.on('finish', () => {
            const duration = Date.now() - start;
            console.log(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
        });
        next();
    });
}

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
app.use('/libs/tinymce/langs', express.static(path.join(__dirname, 'public/libs/tinymce-langs')));
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
