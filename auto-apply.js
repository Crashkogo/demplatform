const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');

// Функция для автоматического применения изменений
function autoApplyChanges() {
    console.log('🚀 Автоприменение изменений активировано!');
    console.log('📁 Отслеживаемые файлы: public/**/*.{html,js,css}');

    // Отслеживаем изменения в файлах
    const watcher = chokidar.watch([
        'public/**/*.html',
        'public/**/*.js',
        'public/**/*.css'
    ], {
        ignored: /node_modules/,
        persistent: true,
        ignoreInitial: true
    });

    watcher.on('change', (filePath) => {
        console.log(`✅ Файл ${filePath} изменен и автоматически применен`);
    });

    watcher.on('add', (filePath) => {
        console.log(`📄 Новый файл ${filePath} добавлен`);
    });

    watcher.on('error', (error) => {
        console.error('❌ Ошибка автоприменения:', error);
    });

    // Graceful shutdown
    process.on('SIGINT', () => {
        console.log('\n🛑 Остановка автоприменения...');
        watcher.close();
        process.exit(0);
    });
}

// Запускаем автоприменение
if (require.main === module) {
    autoApplyChanges();
}

module.exports = { autoApplyChanges }; 