// Глобальные переменные
let currentUser = null;
let currentToken = null;
let dropzone = null;
let allCategories = [];
let allUsers = [];
let allMaterials = [];
let allRoles = []; // Добавлено

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
        console.log('Инициализация админ-панели...');

        // 1. Проверяем наличие токена
        const token = localStorage.getItem('token');
        if (!token) {
            console.log('Токен не найден, перенаправление на страницу входа');
            logout();
            return;
        }

        // 2. Устанавливаем глобальный токен для axios interceptor
        currentToken = token;

        // 3. Инициализируем менеджер прав (загружает данные с сервера)
        const isAuthSuccess = await PermissionsManager.initialize();

        if (!isAuthSuccess) {
            console.error('Не удалось инициализировать PermissionsManager');
            logout();
            return;
        }

        // Получаем данные пользователя
        const user = PermissionsManager.getUser();
        if (!user) {
            console.error('Данные пользователя не получены');
            logout();
            return;
        }

        console.log('Пользователь загружен:', {
            login: user.login,
            roleName: user.roleName,
            isAdmin: PermissionsManager.isAdmin()
        });

        // 4. Настраиваем весь UI на основе полученных прав
        setupUIBasedOnPermissions();

        // 5. Инициализируем остальные компоненты
        initializeEventListeners();

        console.log('Админ-панель инициализирована корректно');

    } catch (error) {
        console.error('Критическая ошибка инициализации:', error);
        showError('Критическая ошибка загрузки админ-панели');
        logout();
    }
}

/**
 * Настраивает весь пользовательский интерфейс на основе прав доступа.
 * Эта функция должна вызываться один раз после успешной инициализации PermissionsManager.
 */
function setupUIBasedOnPermissions() {
    // 1. Обновляем информацию о пользователе в шапке
    const user = PermissionsManager.getUser();
    if (user) {
        document.getElementById('userInfo').textContent = user.login;
        document.querySelector('.dropdown-header').textContent = user.login;
    }

    // 2. Настраиваем видимостсь пунктов меню в сайдбаре
    const visibleSections = setupSidebarVisibility();

    // 3. Настраиваем видимость кнопок "Добавить"
    setupActionButtonsVisibility();

    // 4. Открываем первый доступный раздел по умолчанию
    if (visibleSections.length > 0) {
        // Убираем 'active' класс со всех ссылок и секций по умолчанию
        document.querySelectorAll('.nav-link.active').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.content-section.active').forEach(el => el.classList.remove('active'));

        // Показываем первую доступную секцию
        showSection(visibleSections[0]);
    } else {
        // Если ни один раздел не доступен, показываем сообщение
        showError('Доступ запрещен. У вас нет прав для просмотра админ-панели.');
        // Можно скрыть основной контент и показать сообщение об ошибке
        document.querySelector('.main-content').innerHTML = '<div class="alert alert-danger">У вас нет прав для доступа к этому разделу.</div>';
    }
}

/**
 * Настраивает видимость пунктов меню в сайдбаре на основе прав.
 * @returns {string[]} - Массив идентификаторов видимых секций.
 */
function setupSidebarVisibility() {
    const visibleSections = [];
    const menuItems = document.querySelectorAll('.sidebar .nav-link[data-section]');

    menuItems.forEach(link => {
        const section = link.dataset.section;
        if (PermissionsManager.canViewSection(section)) {
            link.parentElement.style.display = ''; // Показываем li элемент
            visibleSections.push(section);
        } else {
            link.parentElement.style.display = 'none'; // Скрываем li элемент
        }
    });
    return visibleSections;
}

/**
 * Настраивает видимость основных кнопок для создания сущностей.
 */
function setupActionButtonsVisibility() {
    const buttons = [
        { selector: '[data-bs-target="#userModal"]', permission: 'canCreateUsers' },
        { selector: '[data-bs-target="#roleModal"]', permission: 'canManageRoles' },
        { selector: '[data-bs-target="#categoryModal"]', permission: 'canCreateCategories' },
    ];

    buttons.forEach(({ selector, permission }) => {
        const button = document.querySelector(selector);
        if (button) {
            button.style.display = PermissionsManager.has(permission) ? '' : 'none';
        }
    });
}


// Проверка авторизации (больше не нужна, логика в PermissionsManager)
function checkAuth() {
    // Эта функция устарела. PermissionsManager.initialize() теперь является единой точкой входа.
    // Оставляем для обратной совместимости, если где-то вызывается, но она должна вернуть true,
    // так как initializeApp не продолжится без успешной авторизации.
    return true;
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

    // Фильтры истории
    document.getElementById('applyHistoryFilters').addEventListener('click', () => loadHistoryLogs(1));
    document.getElementById('resetHistoryFilters').addEventListener('click', resetHistoryFiltersAndLoad);
}

// Инициализация обработчиков модальных окон
function initializeModalHandlers() {
    // Пользователи
    document.getElementById('saveUserBtn').addEventListener('click', saveUser);
    document.getElementById('userModal').addEventListener('show.bs.modal', async function () {
        await populateUserRoleSelect();
    });
    document.getElementById('userModal').addEventListener('hidden.bs.modal', function () {
        resetUserForm();
    });

    // Роли
    document.getElementById('saveRoleBtn').addEventListener('click', saveRole);
    document.getElementById('roleModal').addEventListener('show.bs.modal', async (event) => {
        const button = event.relatedTarget;
        if (button) {
            const roleId = button.getAttribute('data-role-id');
            if (roleId) {
                await populateRoleForm(roleId);
            } else {
                resetRoleForm();
                await setupRoleCategoryTree();
                document.getElementById('roleModalTitle').textContent = 'Добавить роль';
            }
        }
    });
    document.getElementById('roleModal').addEventListener('hidden.bs.modal', function () {
        resetRoleForm();
    });

    // Обработчик для переключения доступа к категориям
    document.getElementById('canManageAllCategories').addEventListener('change', function () {
        const categorySection = document.getElementById('categoryAccessSection');
        categorySection.style.display = this.checked ? 'none' : 'block';
    });

    // Обработчик для isAdmin - включает все права
    document.getElementById('isAdmin').addEventListener('change', function () {
        if (this.checked) {
            document.querySelectorAll('#roleForm .form-check-input').forEach(checkbox => {
                if (checkbox.id !== 'isAdmin') {
                    checkbox.checked = true;
                }
            });
        }
    });

    // Категории
    document.getElementById('saveCategoryBtn').addEventListener('click', saveCategory);
    document.getElementById('categoryModal').addEventListener('hidden.bs.modal', function () {
        resetCategoryForm();
    });

    // Материалы
    document.getElementById('saveMaterialBtn').addEventListener('click', saveMaterial);
    document.getElementById('materialModal').addEventListener('hidden.bs.modal', function () {
        resetMaterialForm();
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
            case 'roles':
                await loadRoles();
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
            case 'history-section':
                await loadHistorySection();
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
        // Загружаем роли, если еще не загружены (нужны для отображения)
        if (allRoles.length === 0) {
            const rolesResponse = await axios.get('/api/roles');
            if (rolesResponse.data.success) {
                allRoles = rolesResponse.data.data;
            }
        }

        const response = await axios.get('/api/admin/users');

        if (response.data.success) {
            allUsers = response.data.data;
            renderUsers(allUsers);

            // Управляем видимостью кнопки "Добавить пользователя"
            const addUserBtn = document.querySelector('[onclick="addUser()"]');
            if (addUserBtn) {
                addUserBtn.style.display = PermissionsManager.has('canCreateUsers') ? '' : 'none';
            }
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

        // Определяем название роли и цвет бейджа
        let roleName = 'Не назначена';
        let badgeClass = 'bg-secondary';

        if (user.roleId && allRoles.length > 0) {
            const role = allRoles.find(r => r.id === user.roleId);
            if (role) {
                roleName = role.name;
                badgeClass = role.isAdmin ? 'bg-danger' : 'bg-success';
            }
        }

        // Формируем кнопки управления с учетом прав
        let actionsHTML = '';
        if (PermissionsManager.has('canEditUsers')) {
            actionsHTML += `
                <button class="btn btn-sm btn-outline-primary me-1" onclick="editUser(${user.id})">
                    <i class="bi bi-pencil"></i>
                </button>
            `;
        }
        if (PermissionsManager.has('canDeleteUsers')) {
            actionsHTML += `
                <button class="btn btn-sm btn-outline-danger" onclick="deleteUser(${user.id})">
                    <i class="bi bi-trash"></i>
                </button>
            `;
        }
        if (!actionsHTML) {
            actionsHTML = '<span class="text-muted">—</span>';
        }

        row.innerHTML = `
            <td>${user.login}</td>
            <td>
                <span class="badge ${badgeClass}">
                    ${roleName}
                </span>
            </td>
            <td>${createdDate}</td>
            <td>${lastLogin}</td>
            <td>${actionsHTML}</td>
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
async function editUser(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;

    document.getElementById('userId').value = user.id;
    document.getElementById('userLogin').value = user.login;
    document.getElementById('userPassword').value = '';
    document.getElementById('userPassword').required = false;

    // Устанавливаем значение после загрузки списка ролей
    await populateUserRoleSelect();
    document.getElementById('userRole').value = user.roleId;

    document.getElementById('userModalTitle').textContent = 'Редактировать пользователя';

    const modal = new bootstrap.Modal(document.getElementById('userModal'));
    modal.show();
}

// Удаление пользователя
async function deleteUser(userId) {
    const user = allUsers.find(u => u.id === userId);
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
        const roleValue = document.getElementById('userRole').value;

        if (!login || (!password && !userId) || !roleValue) {
            showError('Заполните все обязательные поля');
            return;
        }

        const userData = {
            login,
            roleId: parseInt(roleValue)
        };

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

// Заполнение выпадающего списка ролей для пользователя
async function populateUserRoleSelect() {
    try {
        // Загружаем роли, если еще не загружены
        if (allRoles.length === 0) {
            const response = await axios.get('/api/roles');
            if (response.data.success) {
                allRoles = response.data.data;
            }
        }

        const roleSelect = document.getElementById('userRole');
        roleSelect.innerHTML = '<option value="">Выберите роль</option>';

        // Добавляем роли из базы данных
        allRoles.forEach(role => {
            const option = document.createElement('option');
            option.value = role.id;
            option.textContent = role.name + (role.isAdmin ? ' (Администратор)' : '');
            roleSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Ошибка загрузки ролей:', error);
        showError('Не удалось загрузить список ролей');
    }
}

// Сброс формы пользователя
function resetUserForm() {
    document.getElementById('userForm').reset();
    document.getElementById('userId').value = '';
    document.getElementById('userPassword').required = true;
    document.getElementById('userModalTitle').textContent = 'Добавить пользователя';
}

// Загрузка ролей
async function loadRoles() {
    try {
        const response = await axios.get('/api/roles');
        if (response.data.success) {
            allRoles = response.data.data;
            renderRoles(allRoles);

            // Управляем видимостью кнопки "Добавить роль"
            const addRoleBtn = document.querySelector('[onclick="addRole()"]');
            if (addRoleBtn) {
                addRoleBtn.style.display = PermissionsManager.has('canManageRoles') ? '' : 'none';
            }
        }
    } catch (error) {
        console.error('Ошибка загрузки ролей:', error);
        showError('Ошибка загрузки ролей');
    }
}

// Отображение ролей
function renderRoles(roles) {
    const tbody = document.getElementById('rolesTableBody');
    tbody.innerHTML = '';

    if (roles.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Роли не найдены</td></tr>';
        return;
    }

    roles.forEach(role => {
        const row = document.createElement('tr');

        // Формируем кнопки управления с учетом прав
        let actionsHTML = '';
        if (PermissionsManager.has('canManageRoles')) {
            actionsHTML = `
                <button class="btn btn-sm btn-outline-primary me-1" data-bs-toggle="modal" data-bs-target="#roleModal" data-role-id="${role.id}">
                    <i class="bi bi-pencil"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger" onclick="deleteRole(${role.id})">
                    <i class="bi bi-trash"></i>
                </button>
            `;
        } else {
            actionsHTML = '<span class="text-muted">—</span>';
        }

        row.innerHTML = `
            <td>${role.name}</td>
            <td>${role.description || '-'}</td>
            <td>
                <span class="badge ${role.isAdmin ? 'bg-danger' : 'bg-secondary'}">
                    ${role.isAdmin ? 'Да' : 'Нет'}
                </span>
            </td>
            <td>${actionsHTML}</td>
        `;
        tbody.appendChild(row);
    });
}

// Заполнение формы роли
async function populateRoleForm(roleId) {
    try {
        const response = await axios.get(`/api/roles/${roleId}`);
        if (!response.data.success) {
            showError('Не удалось загрузить данные роли');
            return;
        }
        const role = response.data.data;

        document.getElementById('roleId').value = role.id;
        document.getElementById('roleName').value = role.name;
        document.getElementById('roleDescription').value = role.description || '';

        // Устанавливаем чекбоксы прав
        for (const permission in role) {
            const checkbox = document.getElementById(permission);
            if (checkbox && typeof role[permission] === 'boolean') {
                checkbox.checked = role[permission];
            }
        }

        // Управляем видимостью секции выбора категорий
        const categoryAccessSection = document.getElementById('categoryAccessSection');
        if (role.canManageAllCategories || role.isAdmin) {
            categoryAccessSection.style.display = 'none';
        } else {
            categoryAccessSection.style.display = 'block';
        }

        // Инициализируем и настраиваем дерево категорий
        const allowedCategoryIds = role.allowedCategories ? role.allowedCategories.map(c => c.id) : [];
        await setupRoleCategoryTree(allowedCategoryIds);

        document.getElementById('roleModalTitle').textContent = 'Редактировать роль';
    } catch (error) {
        console.error('Ошибка загрузки роли:', error);
        showError('Ошибка загрузки данных роли');
        // Закрываем модальное окно в случае ошибки
        const modal = bootstrap.Modal.getInstance(document.getElementById('roleModal'));
        if (modal) {
            modal.hide();
        }
    }
}

// Удаление роли
async function deleteRole(roleId) {
    const role = allRoles.find(r => r.id === roleId);
    if (!role) return;

    if (!confirm(`Вы уверены, что хотите удалить роль "${role.name}"?`)) {
        return;
    }

    try {
        const response = await axios.delete(`/api/roles/${roleId}`);
        if (response.data.success) {
            showSuccess(response.data.message);
            await loadRoles();
        } else {
            showError(response.data.message);
        }
    } catch (error) {
        console.error('Ошибка удаления роли:', error);
        showError(error.response?.data?.message || 'Ошибка удаления роли');
    }
}

// Сохранение роли
async function saveRole() {
    try {
        const roleId = document.getElementById('roleId').value;
        const name = document.getElementById('roleName').value.trim();
        const description = document.getElementById('roleDescription').value.trim();

        if (!name) {
            showError('Введите название роли');
            return;
        }

        const permissions = {};
        document.querySelectorAll('#roleForm .form-check-input').forEach(checkbox => {
            permissions[checkbox.id] = checkbox.checked;
        });

        // Получаем выбранные категории только если не установлен полный доступ
        let allowedCategories = [];
        if (!permissions.canManageAllCategories && !permissions.isAdmin) {
            const treeInstance = $('#roleCategoryTree').jstree(true);
            if (treeInstance) {
                allowedCategories = treeInstance.get_selected();
            }
        }

        const roleData = {
            name,
            description,
            ...permissions,
            allowedCategories
        };

        let response;
        if (roleId) {
            response = await axios.put(`/api/roles/${roleId}`, roleData);
        } else {
            response = await axios.post('/api/roles', roleData);
        }

        if (response.data.success) {
            showSuccess(response.data.message);
            bootstrap.Modal.getInstance(document.getElementById('roleModal')).hide();
            await loadRoles();
        } else {
            showError(response.data.message);
        }
    } catch (error) {
        console.error('Ошибка сохранения роли:', error);
        showError(error.response?.data?.message || 'Ошибка сохранения роли');
    }
}

// Сброс формы роли
function resetRoleForm() {
    document.getElementById('roleForm').reset();
    document.getElementById('roleId').value = '';
    document.getElementById('roleModalTitle').textContent = 'Добавить роль';

    // Показываем секцию выбора категорий по умолчанию
    document.getElementById('categoryAccessSection').style.display = 'block';

    // Сбрасываем дерево категорий
    if ($('#roleCategoryTree').jstree(true)) {
        $('#roleCategoryTree').jstree(true).destroy();
    }
}

// Настройка дерева категорий для роли
async function setupRoleCategoryTree(selectedCategoryIds = []) {
    if (allCategories.length === 0) {
        await loadCategories();
    }

    const treeData = allCategories.map(cat => ({
        id: cat.id.toString(),
        parent: cat.parentId ? cat.parentId.toString() : '#',
        text: cat.name,
        state: {
            selected: selectedCategoryIds.includes(cat.id)
        }
    }));

    const treeElement = $('#roleCategoryTree');
    if (treeElement.jstree(true)) {
        treeElement.jstree(true).destroy();
    }

    treeElement.jstree({
        core: {
            data: treeData
        },
        plugins: ["checkbox"],
        checkbox: {
            keep_selected_style: false,
            three_state: false,  // Отключаем автоматический выбор родителей
            cascade: 'down'      // Каскад только вниз к дочерним элементам
        }
    });
}


// Загрузка категорий
async function loadCategories() {
    try {
        const response = await axios.get('/api/categories/flat');

        if (response.data.success) {
            allCategories = response.data.data;
            renderCategories(allCategories);
            updateCategorySelects();

            // Управляем видимостью кнопки "Добавить категорию"
            const addCategoryBtn = document.querySelector('[onclick="addCategory()"]');
            if (addCategoryBtn) {
                addCategoryBtn.style.display = PermissionsManager.has('canCreateCategories') ? '' : 'none';
            }
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
        const parentName = categories.find(c => c.id === category.parentId)?.name || '-';

        // Проверяем доступ к категории
        const hasAccess = PermissionsManager.hasCategoryAccess(category.id);

        // Формируем кнопки управления с учетом прав и доступа
        let actionsHTML = '';
        if (hasAccess) {
            if (PermissionsManager.has('canEditCategories')) {
                actionsHTML += `
                    <button class="btn btn-sm btn-outline-primary me-1" onclick="editCategory(${category.id})">
                        <i class="bi bi-pencil"></i>
                    </button>
                `;
            }
            if (PermissionsManager.has('canDeleteCategories')) {
                actionsHTML += `
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteCategory(${category.id})">
                        <i class="bi bi-trash"></i>
                    </button>
                `;
            }
        }
        if (!actionsHTML) {
            actionsHTML = '<span class="text-muted">—</span>';
        }

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
            <td>${actionsHTML}</td>
        `;
        tbody.appendChild(row);
    });
}

// Редактирование категории
function editCategory(categoryId) {
    const category = allCategories.find(c => c.id === categoryId);
    if (!category) return;

    document.getElementById('categoryId').value = category.id;
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
    const category = allCategories.find(c => c.id === categoryId);
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

        let errorMessage = 'Ошибка сохранения категории';

        if (error.response?.data) {
            const data = error.response.data;

            // Если есть детальные ошибки валидации, показываем их
            if (data.errors && Array.isArray(data.errors)) {
                errorMessage = data.errors.map(err => err.msg || err.message).join(', ');
            } else if (data.message) {
                errorMessage = data.message;
            }
        }

        showError(errorMessage);
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
    const selects = ['categoryParent', 'materialCategory', 'materialCategoryFilter', 'materialEditCategory'];

    selects.forEach(selectId => {
        const select = document.getElementById(selectId);
        if (!select) return;

        // Сохраняем текущее значение
        const currentValue = select.value;

        // Очищаем опции (кроме первой)
        while (select.children.length > 1) {
            select.removeChild(select.lastChild);
        }

        // Добавляем категории с полным путем
        allCategories.forEach(category => {
            const option = document.createElement('option');
            option.value = category.id;

            // Используем функцию для получения пути
            const categoryPath = getCategoryPath(category, allCategories);
            option.textContent = categoryPath;

            select.appendChild(option);
        });

        // Восстанавливаем значение
        select.value = currentValue;
    });
}

// Загрузка материалов
async function loadMaterials() {
    try {
        // Проверяем и загружаем категории, если их еще нет
        if (allCategories.length === 0) {
            await loadCategories();
        }

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

        // Получаем ID категории материала
        const materialCategoryId = material.categoryId?.id || material.categoryId;
        const hasAccess = PermissionsManager.hasCategoryAccess(materialCategoryId);

        // Формируем кнопки управления с учетом прав и доступа
        let actionsHTML = '';
        if (PermissionsManager.has('canViewMaterials')) {
            actionsHTML += `
                <button class="btn btn-sm btn-outline-primary me-1" onclick="viewMaterial(${material.id})">
                    <i class="bi bi-eye"></i>
                </button>
            `;
        }
        if (hasAccess && PermissionsManager.has('canEditMaterials')) {
            actionsHTML += `
                <button class="btn btn-sm btn-outline-secondary me-1" onclick="editMaterial(${material.id})">
                    <i class="bi bi-pencil"></i>
                </button>
            `;
        }
        if (hasAccess && PermissionsManager.has('canDeleteMaterials')) {
            actionsHTML += `
                <button class="btn btn-sm btn-outline-danger" onclick="deleteMaterial(${material.id})">
                    <i class="bi bi-trash"></i>
                </button>
            `;
        }
        if (!actionsHTML) {
            actionsHTML = '<span class="text-muted">—</span>';
        }

        // Получаем полный путь категории
        const categoryId = material.category?.id || material.categoryId;
        let categoryPath = 'Без категории';

        if (categoryId) {
            const category = allCategories.find(c => c.id === categoryId);
            if (category) {
                categoryPath = getCategoryPath(category, allCategories);
            } else if (material.category?.name) {
                // Резервный вариант, если категория не найдена в общем списке
                categoryPath = material.category.name;
            }
        }

        row.innerHTML = `
            <td>
                <div class="d-flex align-items-center">
                    <i class="bi ${typeIcon} me-2 text-${getFileTypeColor(material.fileType)}"></i>
                    ${material.title}
                </div>
            </td>
            <td>${categoryPath}</td>
            <td>
                <span class="badge bg-${getFileTypeColor(material.fileType)}">
                    ${getFileTypeText(material.fileType)}
                </span>
            </td>
            <td>${fileSize}</td>
            <td><span class="badge bg-info">${material.viewCount || 0}</span></td>
            <td><span class="badge bg-success">${material.downloadCount || 0}</span></td>
            <td>${actionsHTML}</td>
        `;
        tbody.appendChild(row);
    });
}

// Поиск материалов (теперь серверная фильтрация)
async function searchMaterials() {
    try {
        const query = document.getElementById('materialSearch').value.trim();
        const categoryFilter = document.getElementById('materialCategoryFilter').value;
        const typeFilter = document.getElementById('materialTypeFilter').value;

        const params = {
            page: 1,
            limit: 1000 // Админ видит все материалы
        };

        if (query) {
            params.search = query;
        }

        if (categoryFilter) {
            params.categoryId = categoryFilter;
        }

        if (typeFilter) {
            params.fileType = typeFilter;
        }

        const response = await axios.get('/api/admin/materials', { params });

        if (response.data.success) {
            allMaterials = response.data.data;
            renderMaterials(allMaterials);
        } else {
            showError(response.data.message);
        }
    } catch (error) {
        console.error('Ошибка поиска материалов:', error);
        showError('Ошибка поиска материалов');
    }
}

// Удаление материала
async function deleteMaterial(materialId) {
    const material = allMaterials.find(m => m.id === materialId);
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
            <p class="text-muted mt-2">Поддерживаются: видео, изображения, документы (до 500MB)</p>
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
            maxFilesize: 500,
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


    // Валидация
    if (!title) {
        showError('Введите название материала');
        return;
    }

    if (!categoryId) {
        showError('Выберите категорию');
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
    PermissionsManager.clear(); // Очищаем права
    window.location.href = '/';
}

// Функция просмотра материала (переход в основное приложение)
function viewMaterial(materialId) {
    // Открываем материал в основном приложении
    const url = `/app.html?material=${materialId}`;
    window.open(url, '_blank');
}

// Редактирование материала
function editMaterial(materialId) {
    const material = allMaterials.find(m => m.id === materialId);
    if (!material) {
        console.error('Материал не найден:', materialId);
        return;
    }

    console.log('Редактируем материал:', material);

    document.getElementById('materialId').value = material.id;
    document.getElementById('materialEditTitle').value = material.title;
    document.getElementById('materialEditDescription').value = material.description || '';

    // Обновляем список категорий в селекте
    updateMaterialCategorySelect();

    // Устанавливаем значение категории (может быть как объект, так и просто ID)
    const catId = material.category?.id || material.categoryId?.id || material.categoryId || '';
    console.log('ID категории материала:', catId, 'Структура category:', material.category, 'categoryId:', material.categoryId);

    document.getElementById('materialEditCategory').value = catId;

    document.getElementById('materialModalTitle').textContent = 'Редактировать материал';

    const modal = new bootstrap.Modal(document.getElementById('materialModal'));
    modal.show();
}

// Сохранение материала
async function saveMaterial() {
    try {
        const materialId = document.getElementById('materialId').value;
        const title = document.getElementById('materialEditTitle').value.trim();
        const categoryId = document.getElementById('materialEditCategory').value;
        const description = document.getElementById('materialEditDescription').value.trim();

        if (!title) {
            showError('Введите название материала');
            return;
        }

        if (!categoryId) {
            showError('Выберите категорию');
            return;
        }

        const materialData = { title, categoryId, description };

        const response = await axios.put(`/api/materials/${materialId}`, materialData);

        if (response.data.success) {
            showSuccess(response.data.message);
            bootstrap.Modal.getInstance(document.getElementById('materialModal')).hide();
            await loadMaterials();
        } else {
            showError(response.data.message);
        }
    } catch (error) {
        console.error('Ошибка сохранения материала:', error);

        let errorMessage = 'Ошибка сохранения материала';

        if (error.response?.data) {
            const data = error.response.data;
            errorMessage = data.message || errorMessage;
        }

        showError(errorMessage);
    }
}

// Сброс формы материала
function resetMaterialForm() {
    document.getElementById('materialEditForm').reset();
    document.getElementById('materialId').value = '';
    document.getElementById('materialModalTitle').textContent = 'Редактировать материал';
}

// Обновление селекта категорий для материала
function updateMaterialCategorySelect() {
    const select = document.getElementById('materialEditCategory');
    if (!select) {
        console.error('Элемент materialEditCategory не найден');
        return;
    }

    console.log('Обновляем список категорий для материала, всего категорий:', allCategories.length);

    // Сохраняем текущее значение
    const currentValue = select.value;

    // Очищаем опции (кроме первой)
    while (select.children.length > 1) {
        select.removeChild(select.lastChild);
    }

    // Добавляем категории
    allCategories.forEach(category => {
        const option = document.createElement('option');
        option.value = category.id;
        option.textContent = getCategoryPath(category, allCategories);
        select.appendChild(option);
    });

    console.log('Добавлено опций:', select.children.length - 1);

    // Восстанавливаем значение
    select.value = currentValue;
    console.log('Установлено значение:', select.value);
}
// Функция для построения полного пути категории
// Оптимизированная версия с использованием Map для быстрого поиска
function getCategoryPath(category, allCategories) {
    // Создаем Map для быстрого доступа к категориям по ID
    const categoryMap = new Map();
    allCategories.forEach(cat => categoryMap.set(cat.id, cat));

    const path = [];
    let current = category;

    // Защита от бесконечного цикла (на случай циклических ссылок)
    const maxDepth = 10;
    let depth = 0;

    // Идем вверх по иерархии
    while (current && depth < maxDepth) {
        path.unshift(current.name); // Добавляем в начало массива

        if (current.parentId) {
            // Быстрый поиск через Map
            current = categoryMap.get(current.parentId);
        } else {
            current = null;
        }

        depth++;
    }

    // Если корневая категория - добавляем "*/"
    if (path.length === 1) {
        return `*/${path[0]}`;
    }

    // Иначе возвращаем полный путь через "/"
    return path.join('/');
}
// Глобальные функции для использования в HTML
window.editUser = editUser;
window.deleteUser = deleteUser;
window.editCategory = editCategory;
window.deleteCategory = deleteCategory;
window.editMaterial = editMaterial;
window.deleteMaterial = deleteMaterial;
window.viewMaterial = viewMaterial;


// --- Раздел "История действий" ---

// Глобальные переменные для истории
let historyCurrentPage = 1;
const HISTORY_ITEMS_PER_PAGE = 15;

// Инициализация раздела истории
async function loadHistorySection() {
    // Устанавливаем сегодняшнюю дату по умолчанию
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('historyDateFrom').value = today;
    document.getElementById('historyDateTo').value = today;

    await loadHistoryUsers();
    await loadHistoryLogs(1);
}

// Загрузка пользователей для фильтра
async function loadHistoryUsers() {
    const userSelect = document.getElementById('historyUser');
    // Загружаем, только если список пуст
    if (userSelect.options.length > 1) {
        return;
    }

    try {
        if (allUsers.length === 0) {
            const response = await axios.get('/api/admin/users');
            if (response.data.success) {
                allUsers = response.data.data;
            }
        }
        allUsers.forEach(user => {
            const option = document.createElement('option');
            option.value = user.id;
            option.textContent = user.login;
            userSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Ошибка загрузки пользователей для фильтра истории:', error);
        showError('Не удалось загрузить список пользователей');
    }
}

// Загрузка логов с сервера
async function loadHistoryLogs(page = 1) {
    historyCurrentPage = page;
    const tbody = document.getElementById('historyTableBody');
    tbody.innerHTML = '<tr><td colspan="4" class="text-center"><div class="spinner-border" role="status"></div></td></tr>';

    try {
        const params = {
            page: historyCurrentPage,
            limit: HISTORY_ITEMS_PER_PAGE,
            dateFrom: document.getElementById('historyDateFrom').value,
            dateTo: document.getElementById('historyDateTo').value,
            eventType: document.getElementById('historyEventType').value,
            userId: document.getElementById('historyUser').value
        };

        const response = await axios.get('/api/admin/logs', { params });

        if (response.data.success) {
            renderHistoryLogs(response.data.data.rows);
            renderHistoryPagination(response.data.data.count);
        } else {
            showError(response.data.message);
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Ошибка загрузки истории</td></tr>';
        }
    } catch (error) {
        console.error('Ошибка загрузки истории:', error);
        showError(error.response?.data?.message || 'Ошибка загрузки истории');
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Ошибка загрузки истории</td></tr>';
    }
}

// Отображение логов в таблице
function renderHistoryLogs(logs) {
    const tbody = document.getElementById('historyTableBody');
    tbody.innerHTML = '';

    if (logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">История за данный период отсутствует</td></tr>';
        return;
    }

    const eventTypeMap = {
        CREATE_CATEGORY: 'Создание категории',
        UPDATE_CATEGORY: 'Редактирование категории',
        DELETE_CATEGORY: 'Удаление категории',
        CREATE_MATERIAL: 'Создание материала',
        UPDATE_MATERIAL: 'Редактирование материала',
        DELETE_MATERIAL: 'Удаление материала',
        DOWNLOAD_MATERIAL: 'Скачивание материала'
    };

    logs.forEach(log => {
        const row = document.createElement('tr');
        const eventDate = new Date(log.createdAt).toLocaleString('ru-RU');
        const userName = log.User ? log.User.login : 'Система';
        const eventName = eventTypeMap[log.eventType] || log.eventType;

        let details = '';
        if (log.details) {
            const categoryPath = log.details['Путь к категории'] || log.details['Категория'];
            const materialTitle = log.details['Название материала'];
            const oldName = log.details['Старое название'];
            const newName = log.details['Новое название'];

            if (materialTitle) { // Событие материала
                details = `<div>${categoryPath}</div><div>${materialTitle}</div>`;
            } else if (categoryPath) { // Событие категории
                details = `<div>${categoryPath}</div>`;
                if (oldName && newName) {
                    details += `<div><small>Переименовано с <strong>${oldName}</strong> на <strong>${newName}</strong></small></div>`;
                }
            } else { // Резервный вариант для других событий
                details = Object.entries(log.details)
                    .map(([key, value]) => `<strong>${key}:</strong> ${value}`)
                    .join('<br>');
            }
        }

        row.innerHTML = `
            <td>${eventDate}</td>
            <td>${userName}</td>
            <td><span class="badge bg-info">${eventName}</span></td>
            <td><small>${details}</small></td>
        `;
        tbody.appendChild(row);
    });
}

// Рендеринг пагинации
function renderHistoryPagination(totalItems) {
    const paginationUl = document.getElementById('historyPagination');
    paginationUl.innerHTML = '';
    const totalPages = Math.ceil(totalItems / HISTORY_ITEMS_PER_PAGE);

    if (totalPages <= 1) return;

    for (let i = 1; i <= totalPages; i++) {
        const li = document.createElement('li');
        li.className = `page-item ${i === historyCurrentPage ? 'active' : ''}`;
        const a = document.createElement('a');
        a.className = 'page-link';
        a.href = '#';
        a.textContent = i;
        a.addEventListener('click', (e) => {
            e.preventDefault();
            loadHistoryLogs(i);
        });
        li.appendChild(a);
        paginationUl.appendChild(li);
    }
}

// Сброс фильтров
function resetHistoryFiltersAndLoad() {
    document.getElementById('historyDateFrom').value = '';
    document.getElementById('historyDateTo').value = '';
    document.getElementById('historyEventType').value = '';
    document.getElementById('historyUser').value = '';
    loadHistoryLogs(1);
}


