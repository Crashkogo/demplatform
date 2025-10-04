module.exports = {
    port: process.env.PORT || 3000,
    host: process.env.HOST || '0.0.0.0', // Слушаем на всех интерфейсах

    // SSL настройки
    ssl: {
        enabled: process.env.SSL_ENABLED === 'true' || process.env.NODE_ENV === 'production',
        keyPath: process.env.SSL_KEY_PATH || './ssl/key.pem',
        certPath: process.env.SSL_CERT_PATH || './ssl/cert.pem'
    },

    // PostgreSQL настройки
    postgres: {
        database: process.env.POSTGRES_DB || 'consultantplus',
        username: process.env.POSTGRES_USER || 'postgres',
        password: process.env.POSTGRES_PASSWORD || 'postgres',
        host: process.env.POSTGRES_HOST || 'localhost',
        port: process.env.POSTGRES_PORT || 5432
    },
    jwtSecret: process.env.JWT_SECRET || 'your_super_secret_jwt_key_change_in_production',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
    uploadsPath: './uploads',
    defaultAdmin: {
        login: process.env.DEFAULT_ADMIN_LOGIN || 'admin',
        password: process.env.DEFAULT_ADMIN_PASSWORD || 'admin123'
    }
}; 