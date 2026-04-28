const rateLimit = require('express-rate-limit');

// Лимит для операций изменения данных (POST/PUT/DELETE)
// 100 запросов за 15 минут с одного IP — достаточно для работы, останавливает автоматизированный abuse
const writeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Слишком много запросов. Попробуйте через 15 минут.'
    }
});

// Лимит для загрузки файлов — отдельный, более строгий
// Загрузка тяжелее по ресурсам
const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Слишком много загрузок файлов. Попробуйте через 15 минут.'
    }
});

module.exports = { writeLimiter, uploadLimiter };
