const axios = require('axios');

const BASE_URL = 'http://localhost:3000'; // Убедитесь, что порт верный

const api = axios.create({
    baseURL: BASE_URL,
    headers: {
        'Content-Type': 'application/json'
    }
});

// Функция для небольшой паузы между запросами
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function runTest() {
    try {
        console.log('--- Запуск скрипта для тестирования логов ---');

        // 1. Авторизация под админом
        console.log('\n1. Авторизация под пользователем admin...');
        const loginResponse = await api.post('/api/auth/login', {
            login: 'admin',
            password: 'admin123'
        });
        const token = loginResponse.data.token;
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        console.log('Успешная авторизация.');

        await sleep(500);

        // 2. Получение материалов
        console.log('\n2. Получение существующих материалов...');
        const materialsResponse = await api.get('/api/materials');
        const materials = materialsResponse.data.data;

        if (materials.length < 2) {
            console.error('ОШИБКА: Для выполнения теста необходимо как минимум 2 материала в базе.');
            return;
        }
        console.log(`Найдено материалов: ${materials.length}.`);
        
        const materialToEdit = materials[0];
        const materialToDelete = materials[1];

        await sleep(500);

        // 3. Редактирование материала
        console.log(`\n3. Редактирование материала (ID: ${materialToEdit.id})...`);
        const newTitle = `Отредактированный заголовок ${Date.now()}`;
        await api.put(`/api/materials/${materialToEdit.id}`, {
            title: newTitle,
            description: materialToEdit.description || '',
            categoryId: materialToEdit.categoryId
        });
        console.log(`Материал ${materialToEdit.id} переименован в "${newTitle}".`);

        await sleep(500);

        // 4. Удаление материала
        console.log(`\n4. Удаление материала (ID: ${materialToDelete.id})...`);
        await api.delete(`/api/materials/${materialToDelete.id}`);
        console.log(`Материал ${materialToDelete.id} удален.`);

        await sleep(500);

        // 5. Создание категорий
        console.log('\n5. Создание тестовых категорий...');
        const categoryTestResponse = await api.post('/api/categories', {
            name: 'КатегорияТест'
        });
        const categoryTest = categoryTestResponse.data.data;
        console.log(`Создана категория "КатегорияТест" (ID: ${categoryTest.id})`);

        await sleep(500);

        const categoryForDeleteResponse = await api.post('/api/categories', {
            name: 'КатегорияТестУдалить'
        });
        const categoryToDelete = categoryForDeleteResponse.data.data;
        console.log(`Создана категория "КатегорияТестУдалить" (ID: ${categoryToDelete.id})`);

        await sleep(500);

        // 6. Удаление категории
        console.log(`\n6. Удаление категории (ID: ${categoryToDelete.id})...`);
        await api.delete(`/api/categories/${categoryToDelete.id}`);
        console.log(`Категория "КатегорияТестУдалить" удалена.`);

        await sleep(500);

        // 7. Редактирование категории
        console.log(`\n7. Редактирование категории (ID: ${categoryTest.id})...`);
        const newDescription = `Новое описание от ${new Date().toLocaleString('ru-RU')}`;
        await api.put(`/api/categories/${categoryTest.id}`, {
            name: categoryTest.name,
            description: newDescription
        });
        console.log(`У категории "КатегорияТест" обновлено описание.`);


        console.log('\n--- Скрипт тестирования логов успешно завершен! ---');
        console.log('Проверьте раздел "История действий" в админ-панели, чтобы убедиться, что все события корректно записаны.');

    } catch (error) {
        console.error('\n--- Во время выполнения скрипта произошла ошибка ---');
        if (error.response) {
            console.error('Статус ответа:', error.response.status);
            console.error('Данные ответа:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('Ошибка:', error.message);
        }
        console.error('\nУбедитесь, что приложение запущено на', BASE_URL);
    }
}

runTest();
