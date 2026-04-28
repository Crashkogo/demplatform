const isProd = process.env.NODE_ENV === 'production';

const logger = {
    debug: isProd ? () => {} : (...args) => console.log('[DEBUG]', ...args),
    info:  (...args) => console.log('[INFO]', ...args),
    warn:  (...args) => console.warn('[WARN]', ...args),
    error: (...args) => console.error('[ERROR]', ...args),
};

module.exports = logger;
