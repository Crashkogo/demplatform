#!/usr/bin/env node

const { spawn } = require('child_process');
const chokidar = require('chokidar');
const path = require('path');

let serverProcess = null;

function startServer() {
    console.log('🚀 Запуск сервера...');

    serverProcess = spawn('node', ['server.js'], {
        stdio: 'inherit',
        cwd: __dirname
    });

    serverProcess.on('exit', (code) => {
        if (code !== null) {
            console.log(`📤 Сервер завершился с кодом ${code}`);
        }
    });

    serverProcess.on('error', (error) => {
        console.error('❌ Ошибка сервера:', error);
    });
}

function stopServer() {
    if (serverProcess) {
        console.log('🛑 Остановка сервера...');
        serverProcess.kill('SIGTERM');
        serverProcess = null;
    }
}

function restartServer() {
    console.log('🔄 Перезапуск сервера...');
    stopServer();
    setTimeout(startServer, 1000);
}

// Отслеживание изменений серверных файлов
const watcher = chokidar.watch([
    'server.js',
    'config.js',
    'models/**/*.js',
    'routes/**/*.js',
    'middleware/**/*.js'
], {
    ignored: /node_modules/,
    persistent: true,
    ignoreInitial: true
});

watcher.on('change', (filePath) => {
    console.log(`📝 Изменен файл: ${filePath}`);
    restartServer();
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Завершение работы...');
    stopServer();
    watcher.close();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Завершение работы...');
    stopServer();
    watcher.close();
    process.exit(0);
});

// Запуск
console.log('🎯 Автоперезапуск сервера активирован');
console.log('📁 Отслеживаемые файлы: server.js, config.js, models/, routes/, middleware/');
console.log('📄 Клиентские файлы (public/) автоприменяются без перезапуска сервера\n');

startServer(); 