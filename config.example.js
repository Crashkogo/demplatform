module.exports = {
    port: process.env.PORT || 3000,
    host: process.env.HOST || '0.0.0.0', // Слушаем на всех интерфейсах

    // SSL настройки
    ssl: {
        enabled: process.env.SSL_ENABLED === 'true' || process.env.NODE_ENV === 'production',
        keyPath: process.env.SSL_KEY_PATH || './ssl/key.pem',
        certPath: process.env.SSL_CERT_PATH || './ssl/cert.pem'
    },

    mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/consultantplus',
    jwtSecret: process.env.JWT_SECRET || 'CHANGE_THIS_IN_PRODUCTION',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
    uploadsPath: './uploads',
    defaultAdmin: {
        login: process.env.DEFAULT_ADMIN_LOGIN || 'admin',
        password: process.env.DEFAULT_ADMIN_PASSWORD || 'CHANGE_THIS_PASSWORD'
    }
}; 