const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

/**
 * Сервис конвертации документов через LibreOffice
 */
class ConvertService {
    constructor() {
        // Папка для временных файлов
        this.tempDir = path.join(os.tmpdir(), 'consultantplus-convert');

        // Создаём папку если её нет
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    /**
     * Конвертирует RTF файл в PDF через LibreOffice
     * @param {string} inputPath - Путь к исходному RTF файлу
     * @returns {Promise<Buffer>} - PDF файл как Buffer
     */
    async convertRTFtoPDF(inputPath) {
        return new Promise((resolve, reject) => {
            // Проверяем существование файла
            if (!fs.existsSync(inputPath)) {
                return reject(new Error('Исходный файл не найден'));
            }

            // Генерируем уникальное имя для временной папки
            const uniqueDir = path.join(this.tempDir, `convert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
            fs.mkdirSync(uniqueDir, { recursive: true });

            // Команда LibreOffice для конвертации
            // --headless - без GUI
            // --convert-to pdf - конвертировать в PDF
            // --outdir - папка для результата
            const command = `soffice --headless --convert-to pdf --outdir "${uniqueDir}" "${inputPath}"`;

            console.log('Запуск конвертации:', command);

            exec(command, { timeout: 60000 }, (error, stdout, stderr) => {
                if (error) {
                    console.error('Ошибка конвертации:', error);
                    console.error('stderr:', stderr);

                    // Очищаем временную папку
                    this.cleanupDir(uniqueDir);

                    return reject(new Error(`Ошибка конвертации: ${error.message}`));
                }

                console.log('Вывод LibreOffice:', stdout);

                // Находим сконвертированный PDF файл
                const files = fs.readdirSync(uniqueDir);
                const pdfFile = files.find(f => f.endsWith('.pdf'));

                if (!pdfFile) {
                    this.cleanupDir(uniqueDir);
                    return reject(new Error('PDF файл не был создан'));
                }

                const pdfPath = path.join(uniqueDir, pdfFile);

                try {
                    // Читаем PDF в память
                    const pdfBuffer = fs.readFileSync(pdfPath);

                    // Очищаем временную папку
                    this.cleanupDir(uniqueDir);

                    resolve(pdfBuffer);
                } catch (readError) {
                    this.cleanupDir(uniqueDir);
                    reject(new Error(`Ошибка чтения PDF: ${readError.message}`));
                }
            });
        });
    }

    /**
     * Проверяет, установлен ли LibreOffice
     * @returns {Promise<boolean>}
     */
    async isLibreOfficeInstalled() {
        return new Promise((resolve) => {
            exec('soffice --version', (error, stdout) => {
                if (error) {
                    console.log('LibreOffice не найден');
                    resolve(false);
                } else {
                    console.log('LibreOffice версия:', stdout.trim());
                    resolve(true);
                }
            });
        });
    }

    /**
     * Очищает временную директорию
     * @param {string} dirPath - Путь к директории
     */
    cleanupDir(dirPath) {
        try {
            if (fs.existsSync(dirPath)) {
                const files = fs.readdirSync(dirPath);
                for (const file of files) {
                    fs.unlinkSync(path.join(dirPath, file));
                }
                fs.rmdirSync(dirPath);
            }
        } catch (error) {
            console.error('Ошибка очистки временной папки:', error);
        }
    }
}

module.exports = new ConvertService();
