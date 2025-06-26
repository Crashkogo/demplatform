// Глобальные переменные
let currentUser = null;
let currentToken = null;
let dropzone = null;
let allCategories = [];
let allUsers = [];
let allMaterials = [];

// Настройка Axios
axios.defaults.baseURL = window.location.origin;

// Настройка перехватчика для токена
axios.interceptors.request.use(
    (config) => {
        if (currentToken) {
            config.headers.Authorization = `Bearer ${currentToken}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Перехватчик ответов для обработки 401 ошибок
axios.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response && error.response.status === 401) {
            logout();
        }
        return Promise.reject(error);
    }
);

// Инициализация приложения
document.addEventListener('DOMContentLoaded', function () {
    // КРИТИЧЕСКИ ВАЖНО: отключаем автообнаружение до всего остального
    if (window.Dropzone) {
        Dropzone.autoDiscover = false;
    }

    initializeApp();

    // Предотвращаем стандартное поведение браузера для drag and drop
    preventDefaultDragBehavior();
});

// Предотвращение стандартного поведения браузера для drag and drop
function preventDefaultDragBehavior() {
    // Простая защита только для window
    ['dragover', 'drop'].forEach(eventName => {
        window.addEventListener(eventName, function (e) {
            // Разрешаем события только для dropzone
            if (!e.target.closest('.dropzone')) {
                e.preventDefault();
            }
        }, false);
    });

    console.log('Защита от стандартного drag&drop поведения активирована');
}

// Инициализация
async function initializeApp() {
    try {
        // Проверяем авторизацию
        if (!checkAuth()) {
            window.location.href = '/';
            return;
        }

        // Проверяем права администратора
        if (currentUser.role !== 'admin') {
            alert('Доступ запрещен. Требуются права администратора.');
            window.location.href = '/app';
            return;
        }

        // Инициализируем компоненты
        initializeEventListeners();
        // НЕ инициализируем Dropzone сразу - только при переходе на вкладку
        await loadDashboard();

        console.log('Админ-панель инициализирована');
    } catch (error) {
        console.error('Ошибка инициализации:', error);
        showError('Ошибка загрузки админ-панели');
    }
}

// Проверка авторизации
function checkAuth() {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');

    if (!token || !user) {
        return false;
    }

    try {
        currentToken = token;
        currentUser = JSON.parse(user);

        // Обновляем информацию о пользователе в интерфейсе
        document.getElementById('userInfo').textContent = currentUser.login;

        return true;
    } catch (error) {
        console.error('Ошибка парсинга данных пользователя:', error);
        logout();
        return false;
    }
}

// Инициализация обработчиков событий
function initializeEventListeners() {
    // Выход из системы
    document.getElementById('logoutBtn').addEventListener('click', function (e) {
        e.preventDefault();
        logout();
    });

    // Навигация по разделам
    document.querySelectorAll('[data-section]').forEach(link => {
        link.addEventListener('click', function (e) {
            e.preventDefault();
            const section = this.dataset.section;
            showSection(section);
        });
    });

    // Поиск пользователей
    document.getElementById('userSearch').addEventListener('input', function () {
        searchUsers(this.value);
    });

    // Поиск материалов
    document.getElementById('materialSearch').addEventListener('input', function () {
        searchMaterials();
    });

    // Фильтры материалов
    document.getElementById('materialCategoryFilter').addEventListener('change', searchMaterials);
    document.getElementById('materialTypeFilter').addEventListener('change', searchMaterials);

    // Модальные окна
    initializeModalHandlers();

    // Форма загрузки
    document.getElementById('uploadForm').addEventListener('submit', handleUpload);
}

// Инициализация обработчиков модальных окон
function initializeModalHandlers() {
    // Пользователи
    document.getElementById('saveUserBtn').addEventListener('click', saveUser);
    document.getElementById('userModal').addEventListener('hidden.bs.modal', function () {
        resetUserForm();
    });

    // Категории
    document.getElementById('saveCategoryBtn').addEventListener('click', saveCategory);
    document.getElementById('categoryModal').addEventListener('hidden.bs.modal', function () {
        resetCategoryForm();
    });
}

// Отображение раздела
async function showSection(sectionName) {
    try {
        console.log('Переходим к разделу:', sectionName);

        // Если уходим с раздела upload, очищаем Dropzone
        const currentActiveSection = document.querySelector('.content-section.active');
        if (currentActiveSection && currentActiveSection.id === 'upload' && sectionName !== 'upload') {
            console.log('Покидаем раздел загрузки, очищаем Dropzone');
            if (dropzone) {
                try {
                    dropzone.destroy();
                    dropzone = null;
                } catch (e) {
                    console.warn('Ошибка при очистке Dropzone при переходе:', e);
                }
            }
        }

        // Скрываем все разделы
        document.querySelectorAll('.content-section').forEach(section => {
            section.classList.remove('active');
        });

        // Убираем активный класс с навигации
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });

        // Показываем выбранный раздел
        document.getElementById(sectionName).classList.add('active');
        document.querySelector(`[data-section="${sectionName}"]`).classList.add('active');

        // Загружаем данные для раздела
        switch (sectionName) {
            case 'dashboard':
                await loadDashboard();
                break;
            case 'users':
                await loadUsers();
                break;
            case 'categories':
                await loadCategories();
                break;
            case 'materials':
                await loadMaterials();
                break;
            case 'upload':
                await loadUploadSection();
                break;
        }
    } catch (error) {
        console.error('Ошибка при переходе к разделу:', error);
        showError('Ошибка при переходе к разделу');
    }
}

// Загрузка панели управления
async function loadDashboard() {
    try {
        const response = await axios.get('/api/admin/stats');

        if (response.data.success) {
            const stats = response.data.data;

            // Обновляем статистику
            document.getElementById('totalUsers').textContent = stats.users.total;
            document.getElementById('totalCategories').textContent = stats.categories.total;
            document.getElementById('totalMaterials').textContent = stats.materials.total;
            document.getElementById('adminUsers').textContent = stats.users.admins;

            // Популярные материалы
            const popularTable = document.getElementById('popularMaterials');
            popularTable.innerHTML = '';

            if (stats.materials.popular && stats.materials.popular.length > 0) {
                stats.materials.popular.forEach(material => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${material.title}</td>
                        <td><span class="badge bg-primary">${material.viewCount || 0}</span></td>
                    `;
                    popularTable.appendChild(row);
                });
            } else {
                popularTable.innerHTML = '<tr><td colspan="2" class="text-center text-muted">В базе ещё нет материалов</td></tr>';
            }

            // Недавние материалы
            const recentTable = document.getElementById('recentMaterials');
            recentTable.innerHTML = '';

            if (stats.materials.recent && stats.materials.recent.length > 0) {
                stats.materials.recent.forEach(material => {
                    const row = document.createElement('tr');
                    const date = new Date(material.createdAt).toLocaleDateString('ru-RU');
                    row.innerHTML = `
                        <td>${material.title}</td>
                        <td><small class="text-muted">${date}</small></td>
                    `;
                    recentTable.appendChild(row);
                });
            } else {
                recentTable.innerHTML = '<tr><td colspan="2" class="text-center text-muted">В базе ещё нет материалов</td></tr>';
            }
        }
    } catch (error) {
        console.error('Ошибка загрузки статистики:', error);

        // Показываем более подробную информацию об ошибке
        const errorMessage = error.response?.data?.message || error.message || 'Неизвестная ошибка';
        console.error('Детали ошибки:', errorMessage);

        // Обновляем интерфейс с сообщением об ошибке
        const popularTable = document.getElementById('popularMaterials');
        const recentTable = document.getElementById('recentMaterials');

        const errorRow = '<tr><td colspan="2" class="text-center text-danger">Ошибка загрузки данных</td></tr>';
        popularTable.innerHTML = errorRow;
        recentTable.innerHTML = errorRow;

        showError(`Ошибка загрузки статистики: ${errorMessage}`);
    }
}

// Загрузка пользователей
async function loadUsers() {
    try {
        const response = await axios.get('/api/admin/users');

        if (response.data.success) {
            allUsers = response.data.data;
            renderUsers(allUsers);
        }
    } catch (error) {
        console.error('Ошибка загрузки пользователей:', error);
        showError('Ошибка загрузки пользователей');
    }
}

// Отображение пользователей
function renderUsers(users) {
    const tbody = document.getElementById('usersTableBody');
    tbody.innerHTML = '';

    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Пользователи не найдены</td></tr>';
        return;
    }

    users.forEach(user => {
        const row = document.createElement('tr');
        const createdDate = new Date(user.createdAt).toLocaleDateString('ru-RU');
        const lastLogin = user.lastLogin ? new Date(user.lastLogin).toLocaleDateString('ru-RU') : 'Никогда';

        row.innerHTML = `
            <td>${user.login}</td>
            <td>
                <span class="badge ${user.role === 'admin' ? 'bg-danger' : 'bg-primary'}">
                    ${user.role === 'admin' ? 'Администратор' : 'Клиент'}
                </span>
            </td>
            <td>${createdDate}</td>
            <td>${lastLogin}</td>
            <td>
                <button class="btn btn-sm btn-outline-primary me-1" onclick="editUser('${user._id}')">
                    <i class="bi bi-pencil"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger" onclick="deleteUser('${user._id}')">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Поиск пользователей
function searchUsers(query) {
    if (!query.trim()) {
        renderUsers(allUsers);
        return;
    }

    const filtered = allUsers.filter(user =>
        user.login.toLowerCase().includes(query.toLowerCase())
    );

    renderUsers(filtered);
}

// Редактирование пользователя
function editUser(userId) {
    const user = allUsers.find(u => u._id === userId);
    if (!user) return;

    document.getElementById('userId').value = user._id;
    document.getElementById('userLogin').value = user.login;
    document.getElementById('userPassword').value = '';
    document.getElementById('userPassword').required = false;
    document.getElementById('userRole').value = user.role;

    document.getElementById('userModalTitle').textContent = 'Редактировать пользователя';

    const modal = new bootstrap.Modal(document.getElementById('userModal'));
    modal.show();
}

// Удаление пользователя
async function deleteUser(userId) {
    const user = allUsers.find(u => u._id === userId);
    if (!user) return;

    if (!confirm(`Вы уверены, что хотите удалить пользователя "${user.login}"?`)) {
        return;
    }

    try {
        const response = await axios.delete(`/api/admin/users/${userId}`);

        if (response.data.success) {
            showSuccess(response.data.message);
            await loadUsers();
        } else {
            showError(response.data.message);
        }
    } catch (error) {
        console.error('Ошибка удаления пользователя:', error);
        showError(error.response?.data?.message || 'Ошибка удаления пользователя');
    }
}

// Сохранение пользователя
async function saveUser() {
    try {
        const userId = document.getElementById('userId').value;
        const login = document.getElementById('userLogin').value.trim();
        const password = document.getElementById('userPassword').value;
        const role = document.getElementById('userRole').value;

        if (!login || (!password && !userId)) {
            showError('Заполните все обязательные поля');
            return;
        }

        const userData = { login, role };
        if (password) {
            userData.password = password;
        }

        let response;
        if (userId) {
            // Обновление
            response = await axios.put(`/api/admin/users/${userId}`, userData);
        } else {
            // Создание
            userData.password = password;
            response = await axios.post('/api/admin/users', userData);
        }

        if (response.data.success) {
            showSuccess(response.data.message);
            bootstrap.Modal.getInstance(document.getElementById('userModal')).hide();
            await loadUsers();
        } else {
            showError(response.data.message);
        }
    } catch (error) {
        console.error('Ошибка сохранения пользователя:', error);
        showError(error.response?.data?.message || 'Ошибка сохранения пользователя');
    }
}

// Сброс формы пользователя
function resetUserForm() {
    document.getElementById('userForm').reset();
    document.getElementById('userId').value = '';
    document.getElementById('userPassword').required = true;
    document.getElementById('userModalTitle').textContent = 'Добавить пользователя';
}

// Загрузка категорий
async function loadCategories() {
    try {
        const response = await axios.get('/api/categories/flat');

        if (response.data.success) {
            allCategories = response.data.data;
            renderCategories(allCategories);
            updateCategorySelects();
        }
    } catch (error) {
        console.error('Ошибка загрузки категорий:', error);
        showError('Ошибка загрузки категорий');
    }
}

// Отображение категорий
function renderCategories(categories) {
    const tbody = document.getElementById('categoriesTableBody');
    tbody.innerHTML = '';

    if (categories.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Категории не найдены</td></tr>';
        return;
    }

    categories.forEach(category => {
        const row = document.createElement('tr');
        const parentName = categories.find(c => c._id === category.parentId)?.name || '-';

        row.innerHTML = `
            <td>${'  '.repeat(category.level)}${category.name}</td>
            <td>${parentName}</td>
            <td>${category.level}</td>
            <td>${category.order}</td>
            <td>
                <span class="badge ${category.isActive ? 'bg-success' : 'bg-secondary'}">
                    ${category.isActive ? 'Активна' : 'Неактивна'}
                </span>
            </td>
            <td>
                <button class="btn btn-sm btn-outline-primary me-1" onclick="editCategory('${category._id}')">
                    <i class="bi bi-pencil"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger" onclick="deleteCategory('${category._id}')">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Редактирование категории
function editCategory(categoryId) {
    const category = allCategories.find(c => c._id === categoryId);
    if (!category) return;

    document.getElementById('categoryId').value = category._id;
    document.getElementById('categoryName').value = category.name;
    document.getElementById('categoryParent').value = category.parentId || '';
    document.getElementById('categoryDescription').value = category.description || '';
    document.getElementById('categoryOrder').value = category.order;

    document.getElementById('categoryModalTitle').textContent = 'Редактировать категорию';

    const modal = new bootstrap.Modal(document.getElementById('categoryModal'));
    modal.show();
}

// Удаление категории
async function deleteCategory(categoryId) {
    const category = allCategories.find(c => c._id === categoryId);
    if (!category) return;

    if (!confirm(`Вы уверены, что хотите удалить категорию "${category.name}"?`)) {
        return;
    }

    try {
        const response = await axios.delete(`/api/categories/${categoryId}`);

        if (response.data.success) {
            showSuccess(response.data.message);
            await loadCategories();
        } else {
            showError(response.data.message);
        }
    } catch (error) {
        console.error('Ошибка удаления категории:', error);
        showError(error.response?.data?.message || 'Ошибка удаления категории');
    }
}

// Сохранение категории
async function saveCategory() {
    try {
        const categoryId = document.getElementById('categoryId').value;
        const name = document.getElementById('categoryName').value.trim();
        const parentId = document.getElementById('categoryParent').value || null;
        const description = document.getElementById('categoryDescription').value.trim();
        const order = parseInt(document.getElementById('categoryOrder').value) || 0;

        if (!name) {
            showError('Введите название категории');
            return;
        }

        const categoryData = { name, parentId, description, order };

        let response;
        if (categoryId) {
            // Обновление
            response = await axios.put(`/api/categories/${categoryId}`, categoryData);
        } else {
            // Создание
            response = await axios.post('/api/categories', categoryData);
        }

        if (response.data.success) {
            showSuccess(response.data.message);
            bootstrap.Modal.getInstance(document.getElementById('categoryModal')).hide();
            await loadCategories();
        } else {
            showError(response.data.message);
        }
    } catch (error) {
        console.error('Ошибка сохранения категории:', error);
        showError(error.response?.data?.message || 'Ошибка сохранения категории');
    }
}

// Сброс формы категории
function resetCategoryForm() {
    document.getElementById('categoryForm').reset();
    document.getElementById('categoryId').value = '';
    document.getElementById('categoryModalTitle').textContent = 'Добавить категорию';
}

// Обновление селектов категорий
function updateCategorySelects() {
    const selects = ['categoryParent', 'materialCategory', 'materialCategoryFilter'];

    selects.forEach(selectId => {
        const select = document.getElementById(selectId);
        if (!select) return;

        // Сохраняем текущее значение
        const currentValue = select.value;

        // Очищаем опции (кроме первой)
        while (select.children.length > 1) {
            select.removeChild(select.lastChild);
        }

        // Добавляем категории
        allCategories.forEach(category => {
            const option = document.createElement('option');
            option.value = category._id;
            option.textContent = '  '.repeat(category.level) + category.name;
            select.appendChild(option);
        });

        // Восстанавливаем значение
        select.value = currentValue;
    });
}

// Загрузка материалов
async function loadMaterials() {
    try {
        const response = await axios.get('/api/admin/materials');

        if (response.data.success) {
            allMaterials = response.data.data;
            renderMaterials(allMaterials);
        }
    } catch (error) {
        console.error('Ошибка загрузки материалов:', error);
        showError('Ошибка загрузки материалов');
    }
}

// Отображение материалов
function renderMaterials(materials) {
    const tbody = document.getElementById('materialsTableBody');
    tbody.innerHTML = '';

    if (materials.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Материалы не найдены</td></tr>';
        return;
    }

    materials.forEach(material => {
        const row = document.createElement('tr');
        const fileSize = formatFileSize(material.fileSize);
        const typeIcon = getFileTypeIcon(material.fileType);

        row.innerHTML = `
            <td>
                <div class="d-flex align-items-center">
                    <i class="bi ${typeIcon} me-2 text-${getFileTypeColor(material.fileType)}"></i>
                    ${material.title}
                </div>
            </td>
            <td>${material.categoryId?.name || 'Без категории'}</td>
            <td>
                <span class="badge bg-${getFileTypeColor(material.fileType)}">
                    ${getFileTypeText(material.fileType)}
                </span>
            </td>
            <td>${fileSize}</td>
            <td><span class="badge bg-info">${material.viewCount || 0}</span></td>
            <td><span class="badge bg-success">${material.downloadCount || 0}</span></td>
            <td>
                <button class="btn btn-sm btn-outline-primary me-1" onclick="viewMaterial('${material._id}')">
                    <i class="bi bi-eye"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger" onclick="deleteMaterial('${material._id}')">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Поиск материалов
function searchMaterials() {
    const query = document.getElementById('materialSearch').value.toLowerCase();
    const categoryFilter = document.getElementById('materialCategoryFilter').value;
    const typeFilter = document.getElementById('materialTypeFilter').value;

    let filtered = allMaterials;

    if (query) {
        filtered = filtered.filter(material =>
            material.title.toLowerCase().includes(query) ||
            material.description?.toLowerCase().includes(query)
        );
    }

    if (categoryFilter) {
        filtered = filtered.filter(material => material.categoryId?._id === categoryFilter);
    }

    if (typeFilter) {
        filtered = filtered.filter(material => material.fileType === typeFilter);
    }

    renderMaterials(filtered);
}

// Удаление материала
async function deleteMaterial(materialId) {
    const material = allMaterials.find(m => m._id === materialId);
    if (!material) return;

    if (!confirm(`Вы уверены, что хотите удалить материал "${material.title}"?`)) {
        return;
    }

    try {
        const response = await axios.delete(`/api/materials/${materialId}`);

        if (response.data.success) {
            showSuccess(response.data.message);
            await loadMaterials();
        } else {
            showError(response.data.message);
        }
    } catch (error) {
        console.error('Ошибка удаления материала:', error);
        showError(error.response?.data?.message || 'Ошибка удаления материала');
    }
}

// Загрузка раздела загрузки
async function loadUploadSection() {
    try {
        console.log('Загружаем раздел загрузки...');

        // Загружаем категории если их нет
        if (allCategories.length === 0) {
            console.log('Загружаем категории...');
            await loadCategories();
        }

        // Проверяем, что элемент dropzone видим перед инициализацией
        setTimeout(() => {
            const dropzoneElement = document.getElementById('fileDropzone');
            if (dropzoneElement && dropzoneElement.offsetParent !== null) {
                console.log('Элемент dropzone видим, инициализируем...');
                initializeDropzone();
            } else {
                console.warn('Элемент dropzone не видим, попробуем еще раз через 200мс');
                setTimeout(() => {
                    initializeDropzone();
                }, 200);
            }
        }, 100); // Небольшая задержка для корректной инициализации

        console.log('Раздел загрузки инициализирован');
    } catch (error) {
        console.error('Ошибка загрузки раздела загрузки:', error);
        showError('Ошибка загрузки раздела загрузки');
    }
}

// Инициализация Dropzone
function initializeDropzone() {
    console.log('Начинаем инициализацию Dropzone');

    // Критически важно: отключаем автообнаружение
    if (window.Dropzone) {
        Dropzone.autoDiscover = false;
    } else {
        console.error('Dropzone не загружен');
        return;
    }

    // Проверяем, что элемент существует
    const dropzoneElement = document.getElementById('fileDropzone');
    if (!dropzoneElement) {
        console.error('Элемент #fileDropzone не найден');
        return;
    }

    console.log('Элемент dropzone найден:', dropzoneElement);

    // Полная очистка всех экземпляров Dropzone
    if (window.Dropzone && window.Dropzone.instances) {
        console.log('Очищаем все экземпляры Dropzone:', window.Dropzone.instances.length);
        window.Dropzone.instances.forEach(instance => {
            try {
                instance.destroy();
            } catch (e) {
                console.warn('Ошибка при очистке экземпляра:', e);
            }
        });
    }

    // Проверяем, есть ли уже Dropzone привязанный к этому элементу
    if (dropzoneElement.dropzone) {
        console.log('Найден существующий Dropzone на элементе, удаляем его');
        try {
            dropzoneElement.dropzone.destroy();
        } catch (e) {
            console.warn('Ошибка при удалении Dropzone с элемента:', e);
        }
        delete dropzoneElement.dropzone;
    }

    // Если есть глобальный dropzone, тоже уничтожаем
    if (dropzone) {
        console.log('Уничтожаем глобальный Dropzone');
        try {
            dropzone.destroy();
        } catch (e) {
            console.warn('Ошибка при уничтожении глобального Dropzone:', e);
        }
        dropzone = null;
    }

    // Полная очистка элемента
    dropzoneElement.innerHTML = '';
    dropzoneElement.className = 'dropzone'; // Оставляем только базовый класс

    // Восстанавливаем HTML содержимое
    dropzoneElement.innerHTML = `
        <div class="dz-message" data-dz-message>
            <i class="bi bi-cloud-upload fs-1 text-muted mb-3"></i><br>
            Перетащите файл сюда или нажмите для выбора
            <p class="text-muted mt-2">Поддерживаются: видео, изображения, документы (до 100MB)</p>
        </div>
    `;

    try {
        console.log('Создаем новый Dropzone');

        // Создаем новый экземпляр с уникальными настройками
        dropzone = new Dropzone(dropzoneElement, {
            url: '/api/materials',
            method: 'post',
            autoProcessQueue: false,
            uploadMultiple: false,
            maxFiles: 1,
            maxFilesize: 100,
            acceptedFiles: 'video/*,image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.txt',
            addRemoveLinks: true,
            clickable: true,
            createImageThumbnails: false, // Отключаем миниатюры для производительности

            // Русские сообщения
            dictDefaultMessage: 'Перетащите файл сюда или нажмите для выбора',
            dictRemoveFile: 'Удалить файл',
            dictFileTooBig: 'Файл слишком большой ({{filesize}}MB). Максимальный размер: {{maxFilesize}}MB.',
            dictInvalidFileType: 'Неподдерживаемый тип файла.',
            dictMaxFilesExceeded: 'Можно загрузить только один файл за раз.',
            dictCancelUpload: 'Отменить загрузку',
            dictRemoveFileConfirmation: null,

            init: function () {
                console.log('Dropzone инициализирован успешно');
                const dz = this;

                // Сохраняем ссылку на Dropzone в элементе
                dropzoneElement.dropzone = this;

                // Обработчик добавления файла
                this.on('addedfile', function (file) {
                    console.log('Файл добавлен:', file.name, 'Размер:', file.size, 'Тип:', file.type);

                    // Удаляем предыдущие файлы если есть
                    if (this.files.length > 1) {
                        this.removeFile(this.files[0]);
                    }

                    // Обновляем интерфейс
                    updateDropzoneUI(true);
                });

                // Обработчик удаления файла
                this.on('removedfile', function (file) {
                    console.log('Файл удален:', file.name);
                    updateDropzoneUI(false);
                });

                // Обработчик ошибок
                this.on('error', function (file, message) {
                    console.error('Ошибка с файлом:', file.name, message);
                    showError(typeof message === 'string' ? message : 'Ошибка при обработке файла');
                });

                // Обработчики drag and drop событий
                this.on('dragenter', function (e) {
                    dropzoneElement.classList.add('dz-drag-hover');
                    console.log('Файл входит в зону dropzone');
                });

                this.on('dragleave', function (e) {
                    dropzoneElement.classList.remove('dz-drag-hover');
                    console.log('Файл покидает зону dropzone');
                });

                this.on('drop', function (e) {
                    dropzoneElement.classList.remove('dz-drag-hover');
                    console.log('Файл сброшен в dropzone');
                });
            }
        });

        console.log('Dropzone создан успешно, экземпляров:', window.Dropzone.instances.length);

    } catch (error) {
        console.error('Ошибка создания Dropzone:', error);
        showError('Ошибка инициализации загрузчика файлов: ' + error.message);
    }

    // Функция обновления UI dropzone
    function updateDropzoneUI(hasFile) {
        const dropzoneEl = document.getElementById('fileDropzone');
        if (dropzoneEl) {
            if (hasFile) {
                dropzoneEl.classList.add('dz-has-files');
            } else {
                dropzoneEl.classList.remove('dz-has-files');
            }
        }
    }
}

// Обработка загрузки
async function handleUpload(e) {
    e.preventDefault();

    console.log('Начинаем обработку загрузки');

    if (!dropzone) {
        showError('Dropzone не инициализирован');
        return;
    }

    const files = dropzone.getAcceptedFiles();
    console.log('Файлы в dropzone:', files);

    if (files.length === 0) {
        showError('Выберите файл для загрузки');
        return;
    }

    const title = document.getElementById('materialTitle').value.trim();
    const categoryId = document.getElementById('materialCategory').value;
    const description = document.getElementById('materialDescription').value.trim();
    const tags = document.getElementById('materialTags').value.trim();

    console.log('Данные формы:', { title, categoryId, description, tags });

    // Получаем роли доступа
    const accessRoles = [];
    if (document.getElementById('accessAdmin').checked) {
        accessRoles.push('admin');
    }
    if (document.getElementById('accessClient').checked) {
        accessRoles.push('client');
    }

    console.log('Роли доступа:', accessRoles);

    // Валидация
    if (!title) {
        showError('Введите название материала');
        return;
    }

    if (!categoryId) {
        showError('Выберите категорию');
        return;
    }

    if (accessRoles.length === 0) {
        showError('Выберите хотя бы одну роль доступа');
        return;
    }

    try {
        const uploadBtn = document.getElementById('uploadBtn');
        uploadBtn.disabled = true;
        uploadBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Загружается...';

        const formData = new FormData();
        formData.append('file', files[0]);
        formData.append('title', title);
        formData.append('categoryId', categoryId);
        formData.append('description', description);
        formData.append('accessRoles', JSON.stringify(accessRoles));

        if (tags) {
            const tagsArray = tags.split(',').map(tag => tag.trim()).filter(tag => tag);
            formData.append('tags', JSON.stringify(tagsArray));
        }

        console.log('Отправляем данные на сервер...');

        const response = await axios.post('/api/materials', formData, {
            headers: {
                'Content-Type': 'multipart/form-data'
            }
        });

        console.log('Ответ сервера:', response.data);

        if (response.data.success) {
            showSuccess(response.data.message);
            resetUploadForm();
        } else {
            showError(response.data.message);
        }
    } catch (error) {
        console.error('Ошибка загрузки материала:', error);

        let errorMessage = 'Ошибка загрузки материала';

        if (error.response) {
            // Сервер ответил с ошибкой
            console.error('Детали ошибки сервера:', error.response.data);
            errorMessage = error.response.data.message || errorMessage;

            if (error.response.data.errors) {
                console.error('Ошибки валидации:', error.response.data.errors);
                errorMessage = error.response.data.errors.map(err => err.msg).join(', ');
            }
        } else if (error.request) {
            // Запрос был сделан, но ответа не было
            errorMessage = 'Нет ответа от сервера';
        }

        showError(errorMessage);
    } finally {
        const uploadBtn = document.getElementById('uploadBtn');
        uploadBtn.disabled = false;
        uploadBtn.innerHTML = '<i class="bi bi-upload me-2"></i>Загрузить материал';
    }
}

// Сброс формы загрузки
function resetUploadForm() {
    document.getElementById('uploadForm').reset();
    document.getElementById('accessClient').checked = true;
    dropzone.removeAllFiles();
}

// Утилиты
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Б';
    const k = 1024;
    const sizes = ['Б', 'КБ', 'МБ', 'ГБ'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getFileTypeIcon(type) {
    const icons = {
        video: 'bi-play-circle',
        image: 'bi-image',
        document: 'bi-file-text',
        other: 'bi-file-earmark'
    };
    return icons[type] || icons.other;
}

function getFileTypeColor(type) {
    const colors = {
        video: 'danger',
        image: 'success',
        document: 'primary',
        other: 'secondary'
    };
    return colors[type] || colors.other;
}

function getFileTypeText(type) {
    const texts = {
        video: 'Видео',
        image: 'Изображение',
        document: 'Документ',
        other: 'Другое'
    };
    return texts[type] || texts.other;
}

function showSuccess(message) {
    // Простое уведомление (можно заменить на toast)
    alert(message);
}

function showError(message) {
    // Простое уведомление об ошибке (можно заменить на toast)
    alert(message);
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/';
}

// Функция просмотра материала (переход в основное приложение)
function viewMaterial(materialId) {
    // Открываем материал в основном приложении
    const url = `/app.html?material=${materialId}`;
    window.open(url, '_blank');
}

// Глобальные функции для использования в HTML
window.editUser = editUser;
window.deleteUser = deleteUser;
window.editCategory = editCategory;
window.deleteCategory = deleteCategory;
window.deleteMaterial = deleteMaterial;
window.viewMaterial = viewMaterial; 