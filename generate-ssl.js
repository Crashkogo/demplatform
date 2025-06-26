const fs = require('fs');
const path = require('path');

console.log('🔐 Генерация SSL сертификатов для локальной разработки...');

// Создаем папку для сертификатов
const sslDir = path.join(__dirname, 'ssl');
if (!fs.existsSync(sslDir)) {
    fs.mkdirSync(sslDir);
}

try {
    // Пытаемся использовать selfsigned
    const selfsigned = require('selfsigned');

    const attrs = [
        { name: 'countryName', value: 'RU' },
        { name: 'stateOrProvinceName', value: 'Moscow' },
        { name: 'localityName', value: 'Moscow' },
        { name: 'organizationName', value: 'ConsultantPlus' },
        { name: 'organizationalUnitName', value: 'IT' },
        { name: 'commonName', value: 'localhost' }
    ];

    const options = {
        keySize: 2048,
        days: 365,
        algorithm: 'sha256',
        extensions: [
            {
                name: 'subjectAltName',
                altNames: [
                    { type: 2, value: 'localhost' },
                    { type: 2, value: '127.0.0.1' },
                    { type: 7, ip: '127.0.0.1' },
                    { type: 7, ip: '::1' }
                ]
            }
        ]
    };

    console.log('📝 Генерируем самоподписанный сертификат...');
    const pems = selfsigned.generate(attrs, options);

    // Сохраняем файлы
    const keyPath = path.join(sslDir, 'key.pem');
    const certPath = path.join(sslDir, 'cert.pem');

    fs.writeFileSync(keyPath, pems.private);
    fs.writeFileSync(certPath, pems.cert);

    console.log('✅ SSL сертификаты созданы успешно!');
    console.log(`📁 Путь: ${sslDir}`);
    console.log(`🔑 Приватный ключ: ${keyPath}`);
    console.log(`📜 Сертификат: ${certPath}`);
    console.log('');
    console.log('🔗 Теперь приложение будет доступно по HTTPS://localhost:3000');
    console.log('⚠️  Браузер покажет предупреждение о небезопасном соединении');
    console.log('   Нажмите "Дополнительно" → "Перейти на localhost (небезопасно)"');
    console.log('');
    console.log('🚀 Для запуска с HTTPS выполните:');
    console.log('   npm run https');

} catch (error) {
    console.error('❌ Ошибка генерации сертификатов:', error.message);
    console.log('');
    console.log('💡 Альтернативные способы:');
    console.log('');
    console.log('1. mkcert (рекомендуется):');
    console.log('   - Скачайте: https://github.com/FiloSottile/mkcert/releases');
    console.log('   - Выполните: mkcert -install');
    console.log('   - Выполните: mkcert localhost 127.0.0.1 ::1');
    console.log('   - Переименуйте файлы в cert.pem и key.pem');
    console.log('');
    console.log('2. OpenSSL:');
    console.log('   - Установите OpenSSL для Windows');
    console.log('   - Выполните команды из HTTPS_SETUP.md');
    console.log('');
    console.log('3. Готовые сертификаты:');
    console.log('   - Создайте папку ssl/');
    console.log('   - Поместите туда key.pem и cert.pem');
} 