// Глобальные переменные
let currentUser = null;
let currentToken = null;
let currentCategoryId = null;
let allMaterials = [];
let filteredMaterials = [];
let currentPage = 1;
let hasMoreMaterials = false;
let fuse = null;

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
    initializeApp();
});

// Инициализация
async function initializeApp() {
    try {
        // Проверяем наличие токена в localStorage.
        const token = localStorage.getItem('token');
        if (!token) {
            console.log('Токен не найден, перенаправление на страницу входа');
            window.location.href = '/';
            return;
        }
        currentToken = token;

        // Асинхронно инициализируем менеджер прав. Это загрузит свежие данные с сервера.
        const isInitialized = await PermissionsManager.initialize();

        if (!isInitialized) {
            console.error('Не удалось инициализировать PermissionsManager');
            logout();
            return;
        }

        // Настраиваем UI на основе полученных прав
        setupUserInterface();

        // Инициализируем остальные компоненты приложения.
        initializeEventListeners();
        await loadCategories();
        await loadMaterials();
        setupFuseSearch();

        // Проверяем, есть ли параметр материала в URL для авто-открытия.
        checkForMaterialParameter();

        console.log('Приложение инициализировано корректно.');
    } catch (error) {
        console.error('Ошибка инициализации:', error);
        showError('Ошибка загрузки приложения');
        logout();
    }
}

// Настройка пользовательского интерфейса на основе прав
function setupUserInterface() {
    // Получаем данные пользователя из PermissionsManager (всегда актуальные)
    const user = PermissionsManager.getUser();

    if (!user) {
        console.error('Данные пользователя не найдены в PermissionsManager');
        logout();
        return;
    }

    console.log('Настраиваем UI для пользователя:', user);

    // Сохраняем текущего пользователя в глобальную переменную
    currentUser = user;

    // Обновляем информацию о пользователе в интерфейсе
    const userInfoElement = document.getElementById('userInfo');
    const userRoleElement = document.getElementById('userRole');

    if (userInfoElement) {
        userInfoElement.textContent = user.login;
    }

    if (userRoleElement) {
        // Используем roleName из PermissionsManager, который был установлен при обработке данных
        const roleName = user.roleName || 'Не назначена';
        userRoleElement.textContent = `Роль: ${roleName}`;
        console.log('Отображаемая роль:', roleName);
    }

    // Показываем кнопки админ-панели, если есть права
    const hasAdminAccess = PermissionsManager.isAdmin() ||
        PermissionsManager.canViewSection('users') ||
        PermissionsManager.canViewSection('roles') ||
        PermissionsManager.canViewSection('categories') ||
        PermissionsManager.canViewSection('materials') ||
        PermissionsManager.canViewSection('upload') ||
        PermissionsManager.canViewSection('history-section');

    console.log('Проверка доступа к админ-панели:', hasAdminAccess);

    if (hasAdminAccess) {
        const adminPanelBtn = document.getElementById('adminPanelBtn');
        const adminMenuLink = document.getElementById('adminMenuLink');
        const adminMenuDivider = document.getElementById('adminMenuDivider');

        if (adminPanelBtn) {
            adminPanelBtn.style.display = 'block';
            console.log('Кнопка админ-панели отображена');
        }
        if (adminMenuLink) {
            adminMenuLink.style.display = 'block';
        }
        if (adminMenuDivider) {
            adminMenuDivider.style.display = 'block';
        }
    } else {
        console.log('У пользователя нет доступа к админ-панели');
    }
}

// Проверка авторизации (устаревшая функция для обратной совместимости)
function checkAuth() {
    console.warn('checkAuth() устарела, используйте setupUserInterface()');
    return PermissionsManager.isInitialized;
}

// Инициализация обработчиков событий
function initializeEventListeners() {
    // Выход из системы
    document.getElementById('logoutBtn').addEventListener('click', function (e) {
        e.preventDefault();
        logout();
    });

    // Поиск (десктоп)
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');

    if (searchBtn) {
        searchBtn.addEventListener('click', performSearch);
    }
    if (searchInput) {
        searchInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                performSearch();
            }
        });

        // Дебаунс для поиска по вводу
        let searchTimeout;
        searchInput.addEventListener('input', function () {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                if (this.value.length >= 2 || this.value.length === 0) {
                    performSearch();
                }
            }, 500);
        });
    }

    // Поиск (мобильный)
    const searchInputMobile = document.getElementById('searchInputMobile');
    const searchBtnMobile = document.getElementById('searchBtnMobile');

    if (searchBtnMobile) {
        searchBtnMobile.addEventListener('click', performSearchMobile);
    }
    if (searchInputMobile) {
        searchInputMobile.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                performSearchMobile();
            }
        });

        // Дебаунс для поиска по вводу
        let searchTimeoutMobile;
        searchInputMobile.addEventListener('input', function () {
            clearTimeout(searchTimeoutMobile);
            searchTimeoutMobile = setTimeout(() => {
                if (this.value.length >= 2 || this.value.length === 0) {
                    performSearchMobile();
                }
            }, 500);
        });
    }

    // Фильтр по типу файлов (десктоп)
    const fileTypeFilter = document.getElementById('fileTypeFilter');
    if (fileTypeFilter) {
        fileTypeFilter.addEventListener('change', function () {
            performSearch();
        });
    }

    // Фильтр по типу файлов (мобильный)
    const fileTypeFilterMobile = document.getElementById('fileTypeFilterMobile');
    if (fileTypeFilterMobile) {
        fileTypeFilterMobile.addEventListener('change', function () {
            performSearchMobile();
        });
    }

    // Сортировка
    document.getElementById('sortSelect').addEventListener('change', function () {
        applySorting();
    });

    // Кнопка "Загрузить ещё"
    document.getElementById('loadMoreBtn').addEventListener('click', function () {
        loadMoreMaterials();
    });

    // Мобильная кнопка раскрытия категорий
    const mobileCategoryToggle = document.getElementById('mobileCategoryToggle');
    if (mobileCategoryToggle) {
        mobileCategoryToggle.addEventListener('click', toggleMobileCategoryTree);
    }
}

// Загрузка категорий
async function loadCategories() {
    try {
        console.log('Загружаем категории...');
        showLoader('treeLoader', true);
        showLoader('treeLoaderMobile', true);

        const response = await axios.get('/api/categories');

        console.log('Ответ категорий от сервера:', response.data);

        if (response.data.success) {
            console.log('Загружено категорий:', response.data.data.length);
            console.log('Данные категорий:', response.data.data);

            // Проверяем, есть ли доступные категории
            if (response.data.data.length === 0) {
                showError('У вас нет доступа ни к одной категории. Обратитесь к администратору.');
                return;
            }

            initializeCategoryTree(response.data.data);
        } else {
            console.error('Ошибка загрузки категорий от сервера:', response.data.message);
            throw new Error(response.data.message);
        }
    } catch (error) {
        console.error('Ошибка загрузки категорий:', error);
        console.error('Детали ошибки категорий:', error.response?.data || error.message);
        showError('Ошибка загрузки категорий: ' + (error.response?.data?.message || error.message));
    } finally {
        showLoader('treeLoader', false);
        showLoader('treeLoaderMobile', false);
    }
}

// Инициализация дерева категорий
function initializeCategoryTree(categories) {
    console.log('Инициализируем дерево категорий с данными:', categories);

    // Проверяем, что jsTree загружен
    if (!window.$ || !$.fn.jstree) {
        console.error('jsTree не загружен!');
        return;
    }

    const treeData = convertToJsTreeFormat(categories);
    console.log('Данные для jsTree:', treeData);

    // Проверяем, что элементы дерева существуют
    const desktopTree = $('#categoryTree');
    const mobileTree = $('#categoryTreeMobile');
    console.log('Элемент desktop дерева найден:', desktopTree.length > 0);
    console.log('Элемент mobile дерева найден:', mobileTree.length > 0);

    // Инициализация десктопного дерева
    $('#categoryTree').jstree({
        'core': {
            'data': [
                {
                    id: 'all',
                    text: 'Все материалы',
                    icon: 'bi bi-folder-fill',
                    state: { opened: true, selected: true }
                },
                ...treeData
            ],
            'themes': {
                'name': 'default',
                'responsive': true
            },
            'check_callback': true
        },
        'plugins': ['themes', 'ui', 'types'],
        'types': {
            'default': {
                'icon': 'bi bi-folder'
            },
            'root': {
                'icon': 'bi bi-folder-fill'
            }
        }
    }).on('changed.jstree', function (e, data) {
        if (data.selected.length > 0) {
            const nodeId = data.selected[0];
            selectCategory(nodeId);
        }
    });

    // Инициализация мобильного дерева
    $('#categoryTreeMobile').jstree({
        'core': {
            'data': [
                {
                    id: 'all',
                    text: 'Все материалы',
                    icon: 'bi bi-folder-fill',
                    state: { opened: true, selected: true }
                },
                ...treeData
            ],
            'themes': {
                'name': 'default',
                'responsive': true
            },
            'check_callback': true
        },
        'plugins': ['themes', 'ui', 'types'],
        'types': {
            'default': {
                'icon': 'bi bi-folder'
            },
            'root': {
                'icon': 'bi bi-folder-fill'
            }
        }
    }).on('changed.jstree', function (e, data) {
        if (data.selected.length > 0) {
            const nodeId = data.selected[0];
            selectCategoryMobile(nodeId);
        }
    });
}

// Конвертация данных для jsTree
function convertToJsTreeFormat(categories) {
    return categories.map(category => ({
        id: category.id,
        text: category.name,
        icon: 'bi bi-folder',
        children: category.children ? convertToJsTreeFormat(category.children) : [],
        state: {
            opened: category.children && category.children.length > 0 ? true : false,
            disabled: false
        }
    }));
}

// Выбор категории
async function selectCategory(categoryId) {
    try {
        currentCategoryId = categoryId === 'all' ? null : categoryId;
        currentPage = 1;

        // Обновляем хлебные крошки
        updateBreadcrumb(categoryId);

        // Загружаем материалы категории
        await loadMaterials();

    } catch (error) {
        console.error('Ошибка выбора категории:', error);
        showError('Ошибка загрузки материалов категории');
    }
}

// Обновление хлебных крошек
function updateBreadcrumb(categoryId) {
    const breadcrumb = document.getElementById('breadcrumb');
    const contentTitle = document.getElementById('contentTitle');
    const mobileBreadcrumb = document.getElementById('mobileBreadcrumb');

    if (categoryId === 'all' || !categoryId) {
        breadcrumb.innerHTML = '<li class="breadcrumb-item active">Все материалы</li>';
        contentTitle.textContent = 'Все материалы';
        if (mobileBreadcrumb) mobileBreadcrumb.textContent = 'Все материалы';
    } else {
        // Получаем путь до категории
        const tree = $('#categoryTree').jstree(true);
        const node = tree.get_node(categoryId);
        const path = tree.get_path(node, false, true);

        let breadcrumbHtml = '<li class="breadcrumb-item"><a href="#" onclick="selectCategory(\'all\')">Все материалы</a></li>';

        path.forEach((nodeName, index) => {
            if (index === path.length - 1) {
                breadcrumbHtml += `<li class="breadcrumb-item active">${nodeName}</li>`;
            } else {
                breadcrumbHtml += `<li class="breadcrumb-item"><a href="#" onclick="selectCategoryByName('${nodeName}')">${nodeName}</a></li>`;
            }
        });

        breadcrumb.innerHTML = breadcrumbHtml;
        contentTitle.textContent = node.text;
        if (mobileBreadcrumb) mobileBreadcrumb.textContent = node.text;
    }
}

// Загрузка материалов
async function loadMaterials(append = false) {
    try {
        if (!append) {
            showLoader('materialsLoader', true);
            currentPage = 1;
        }

        const params = {
            page: currentPage,
            limit: 12
        };

        if (currentCategoryId) {
            params.categoryId = currentCategoryId;
        }

        const fileType = document.getElementById('fileTypeFilter').value;
        if (fileType) {
            params.fileType = fileType;
        }

        const searchQuery = document.getElementById('searchInput').value.trim();
        if (searchQuery) {
            params.search = searchQuery;
        }

        const response = await axios.get('/api/materials', { params });

        if (response.data.success) {
            const materials = response.data.data;

            if (append) {
                allMaterials = [...allMaterials, ...materials];
            } else {
                allMaterials = materials;
            }

            hasMoreMaterials = response.data.pagination.hasMore;

            renderMaterials(append);
            updateStats();

            // Обновляем кнопку "Загрузить ещё"
            const loadMoreBtn = document.getElementById('loadMoreBtn');
            if (loadMoreBtn) {
                loadMoreBtn.style.display = hasMoreMaterials ? 'block' : 'none';
            }

        } else {
            throw new Error(response.data.message);
        }
    } catch (error) {
        console.error('Ошибка загрузки материалов:', error);
        console.error('Детали ошибки:', error.response?.data || error.message);

        if (error.response?.status === 401) {
            showError('Ошибка авторизации. Перенаправление на страницу входа...');
            setTimeout(() => logout(), 2000);
        } else if (error.response?.status === 403) {
            showError('Нет доступа к материалам');
        } else {
            showError('Ошибка загрузки материалов: ' + (error.response?.data?.message || error.message));
        }
    } finally {
        if (!append) {
            showLoader('materialsLoader', false);
        }
    }
}

// Загрузка дополнительных материалов
async function loadMoreMaterials() {
    currentPage++;
    await loadMaterials(true);
}

// Отображение материалов
function renderMaterials(append = false) {
    const container = document.getElementById('materialsList');
    const noMaterials = document.getElementById('noMaterials');

    if (!append) {
        container.innerHTML = '';
        // Обновляем класс контейнера в зависимости от устройства
        if (isMobile()) {
            container.className = '';
        } else {
            container.className = 'row g-3';
        }
    }

    if (allMaterials.length === 0) {
        noMaterials.style.display = 'block';
        return;
    } else {
        noMaterials.style.display = 'none';
    }

    const materialsToRender = append ?
        allMaterials.slice((currentPage - 1) * 12) :
        allMaterials;

    materialsToRender.forEach(material => {
        const materialCard = createMaterialCard(material);
        container.appendChild(materialCard);
    });
}

// Проверка мобильного устройства
function isMobile() {
    return window.innerWidth < 992;
}

// Создание карточки материала
function createMaterialCard(material) {
    const fileIcon = getFileIcon(material.fileType);
    const fileSize = formatFileSize(material.fileSize);
    const createdDate = new Date(material.createdAt).toLocaleDateString('ru-RU');

    if (isMobile()) {
        // Компактная карточка для мобильных устройств
        const card = document.createElement('div');
        card.className = 'compact-material-card';

        card.innerHTML = `
            <div class="compact-file-icon ${material.fileType}">
                <i class="bi ${fileIcon}"></i>
            </div>
            <div class="compact-material-info">
                <h6 class="compact-material-title">${material.title}</h6>
                <p class="compact-material-meta">${createdDate} • ${fileSize}</p>
            </div>
            <div class="compact-material-actions">
                <button class="btn btn-outline-primary compact-btn" onclick="viewMaterial(${material.id})" title="Просмотр">
                    <i class="bi bi-eye"></i>
                </button>
                <button class="btn btn-outline-success compact-btn" onclick="downloadMaterial(${material.id})" title="Скачать">
                    <i class="bi bi-download"></i>
                </button>
            </div>
        `;

        return card;
    } else {
        // Обычная карточка для десктопа
        const col = document.createElement('div');
        col.className = 'col-lg-4 col-md-6';

        col.innerHTML = `
            <div class="card material-card h-100">
                <div class="card-body">
                    <div class="d-flex align-items-start mb-3">
                        <div class="file-icon ${material.fileType} me-3">
                            <i class="bi ${fileIcon}"></i>
                        </div>
                        <div class="flex-grow-1">
                            <h6 class="card-title mb-1">${material.title}</h6>
                            <small class="text-muted">${material.category?.name || 'Без категории'}</small>
                        </div>
                    </div>
                    
                    ${material.description ? `<p class="card-text text-muted small">${material.description.substring(0, 100)}${material.description.length > 100 ? '...' : ''}</p>` : ''}
                    
                    <div class="d-flex justify-content-between align-items-center">
                        <div class="small text-muted">
                            <i class="bi bi-calendar3 me-1"></i>${createdDate}<br>
                            <i class="bi bi-file-earmark me-1"></i>${fileSize}
                        </div>
                        <div class="small text-muted text-end">
                            <i class="bi bi-eye me-1"></i>${material.viewCount || 0}<br>
                            <i class="bi bi-download me-1"></i>${material.downloadCount || 0}
                        </div>
                    </div>
                </div>
                <div class="card-footer bg-transparent">
                    <div class="d-flex gap-2">
                        <button class="btn btn-outline-primary btn-sm flex-grow-1" onclick="viewMaterial(${material.id})">
                            <i class="bi bi-eye me-1"></i>Просмотр
                        </button>
                        <button class="btn btn-outline-success btn-sm" onclick="downloadMaterial(${material.id})">
                            <i class="bi bi-download"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;

        return col;
    }
}

// Получение иконки файла
function getFileIcon(fileType) {
    const icons = {
        video: 'bi-play-circle',
        image: 'bi-image',
        document: 'bi-file-text',
        other: 'bi-file-earmark'
    };
    return icons[fileType] || icons.other;
}

// Форматирование размера файла
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Б';
    const k = 1024;
    const sizes = ['Б', 'КБ', 'МБ', 'ГБ'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Просмотр материала
async function viewMaterial(materialId) {
    try {
        const response = await axios.get(`/api/materials/${materialId}`);

        if (response.data.success) {
            const material = response.data.data;
            showMaterialModal(material);
        } else {
            throw new Error(response.data.message);
        }
    } catch (error) {
        console.error('Ошибка загрузки материала:', error);
        showError('Ошибка загрузки материала');
    }
}

// Показ модального окна с материалом
function showMaterialModal(material) {
    const modalElement = document.getElementById('materialModal');
    const modal = new bootstrap.Modal(modalElement);

    // Добавляем обработчик закрытия модального окна
    modalElement.addEventListener('hidden.bs.modal', function () {
        removePDFKeyboardHandlers();
    }, { once: true });
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    const downloadBtn = document.getElementById('downloadBtn');

    modalTitle.textContent = material.title;

    // Удаляем старые обработчики и добавляем новый для скачивания
    downloadBtn.onclick = () => downloadMaterial(material.id);

    let bodyContent = '';

    console.log('Отображаем материал:', material.title, 'Тип:', material.fileType, 'MIME:', material.mimeType);

    if (material.fileType === 'video') {
        bodyContent = `
            <div class="fullscreen-document-viewer">
                <div class="document-content d-flex align-items-center justify-content-center" style="background: #000;">
                    <video id="videoPlayer" controls style="max-width: 90%; max-height: 90%; width: auto; height: auto; display: none;">
                        Ваш браузер не поддерживает видео.
                    </video>
                    <div id="videoLoader" class="text-center">
                        <div class="spinner-border text-white" role="status">
                            <span class="visually-hidden">Загрузка видео...</span>
                        </div>
                        <div class="text-white mt-2">Загрузка видео...</div>
                    </div>
                </div>
            </div>
        `;
    } else if (material.fileType === 'image') {
        bodyContent = `
            <div class="fullscreen-document-viewer">
                <div class="document-content d-flex align-items-center justify-content-center" style="background: #000;">
                    <img id="imageViewer" alt="${material.title}" 
                         style="max-width: 90%; max-height: 90%; object-fit: contain; display: none;">
                    <div id="imageLoader" class="text-center">
                        <div class="spinner-border text-white" role="status">
                            <span class="visually-hidden">Загрузка изображения...</span>
                        </div>
                        <div class="text-white mt-2">Загрузка изображения...</div>
                    </div>
                </div>
            </div>
        `;
    } else if (material.fileType === 'document') {
        // Полноэкранный просмотрщик документов
        const isPDF = material.mimeType === 'application/pdf';
        const isDOCX = material.mimeType.includes('wordprocessingml') || material.originalName?.toLowerCase().endsWith('.docx');
        const isDOC = material.mimeType === 'application/msword' || material.originalName?.toLowerCase().endsWith('.doc');
        const isXLSX = material.mimeType.includes('spreadsheet') || material.mimeType.includes('excel') ||
            material.originalName?.toLowerCase().endsWith('.xlsx') || material.originalName?.toLowerCase().endsWith('.xls');
        const isPPTX = material.mimeType.includes('presentation') || material.mimeType.includes('powerpoint') ||
            material.originalName?.toLowerCase().endsWith('.pptx') || material.originalName?.toLowerCase().endsWith('.ppt');
        const isRTF = material.mimeType === 'application/rtf' || material.mimeType === 'text/rtf' ||
            material.originalName?.toLowerCase().endsWith('.rtf');
        const isODF = material.mimeType.includes('opendocument') ||
            material.originalName?.toLowerCase().endsWith('.odt') ||
            material.originalName?.toLowerCase().endsWith('.ods') ||
            material.originalName?.toLowerCase().endsWith('.odp');

        if (isPDF) {
            // Полноэкранный PDF просмотрщик
            bodyContent = `
                <div class="fullscreen-document-viewer">
                    <div class="pdf-controls-wrapper d-flex justify-content-between align-items-center mb-2">
                        <button type="button" class="btn btn-outline-light btn-sm" onclick="closePDFViewer()" title="Закрыть (Escape)">
                            <i class="bi bi-x-lg"></i>
                        </button>
                        <div class="pdf-controls-container d-flex align-items-center gap-3">
                            <div class="pdf-info d-flex align-items-center">
                                <span class="text-white" id="totalPagesSpan">Страниц: 1</span>
                            </div>
                            <div class="pdf-zoom d-flex align-items-center">
                                <button type="button" class="btn btn-outline-light btn-sm" onclick="zoomPDF('out')" title="Уменьшить (Ctrl + -)">
                                    <i class="bi bi-dash-lg"></i>
                                </button>
                                <span class="text-white mx-2" id="zoomInfo" style="min-width: 50px; text-align: center;">100%</span>
                                <button type="button" class="btn btn-outline-light btn-sm" onclick="zoomPDF('in')" title="Увеличить (Ctrl + +)">
                                    <i class="bi bi-plus-lg"></i>
                                </button>
                                <button type="button" class="btn btn-outline-light btn-sm ms-2" onclick="zoomPDF('reset')" title="100% масштаб (Ctrl + 0)">
                                    <i class="bi bi-arrow-clockwise"></i>
                                </button>
                            </div>
                        </div>
                        <div style="width: 40px;"></div> <!-- Балансировка для центрирования -->
                    </div>
                    <div class="document-content-wrapper" style="flex: 1; overflow: hidden; display: flex; justify-content: center; align-items: flex-start;">
                        <div class="document-scroll-container" id="pdfScrollContainer" style="overflow: auto; max-height: 100%; max-width: 100%; cursor: grab;">
                            <div id="pdfPagesContainer" style="display: flex; flex-direction: column; gap: 20px; padding: 20px;">
                                <!-- PDF страницы будут добавлены здесь -->
                            </div>
                        </div>
                    </div>
                </div>
            `;
        } else if (isDOCX) {
            // Полноэкранный DOCX просмотрщик
            bodyContent = `
                <div class="fullscreen-document-viewer">
                    <div class="document-content">
                        <div id="docxContainer" style="max-width: 900px; margin: 0 auto; padding: 40px; background: white; min-height: calc(100vh - 40px); box-shadow: 0 0 20px rgba(0,0,0,0.1);">
                            <div class="text-center">
                                <div class="spinner-border text-primary" role="status">
                                    <span class="visually-hidden">Загрузка документа...</span>
                                </div>
                                <div class="mt-3">Загрузка документа...</div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        } else if (isDOC) {
            // Старый формат Word (.doc)
            bodyContent = `
                <div class="fullscreen-document-viewer">
                    <div class="document-content">
                        <div id="docContainer" style="max-width: 900px; margin: 0 auto; padding: 40px; background: white; min-height: calc(100vh - 40px); box-shadow: 0 0 20px rgba(0,0,0,0.1);">
                            <div class="text-center">
                                <div class="spinner-border text-primary" role="status">
                                    <span class="visually-hidden">Загрузка документа...</span>
                                </div>
                                <div class="mt-3">Загрузка документа...</div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        } else if (isXLSX) {
            // Excel документы
            bodyContent = `
                <div class="fullscreen-document-viewer">
                    <div class="document-content" style="background: #f5f5f5;">
                        <div id="xlsxContainer" style="max-width: 100%; margin: 0 auto; padding: 20px; min-height: calc(100vh - 40px);">
                            <div class="text-center">
                                <div class="spinner-border text-success" role="status">
                                    <span class="visually-hidden">Загрузка таблицы...</span>
                                </div>
                                <div class="mt-3">Загрузка таблицы...</div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        } else if (isPPTX) {
            // PowerPoint презентации
            bodyContent = `
                <div class="fullscreen-document-viewer">
                    <div class="document-content" style="background: #2c3e50;">
                        <div id="pptxContainer" style="max-width: 1200px; margin: 0 auto; padding: 20px; min-height: calc(100vh - 40px);">
                            <div class="text-center">
                                <div class="spinner-border text-warning" role="status">
                                    <span class="visually-hidden">Загрузка презентации...</span>
                                </div>
                                <div class="mt-3 text-white">Загрузка презентации...</div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        } else if (isRTF) {
            // RTF документы
            bodyContent = `
                <div class="fullscreen-document-viewer">
                    <div class="document-content">
                        <div id="rtfContainer" style="max-width: 900px; margin: 0 auto; padding: 40px; background: white; min-height: calc(100vh - 40px); box-shadow: 0 0 20px rgba(0,0,0,0.1);">
                            <div class="text-center">
                                <div class="spinner-border text-primary" role="status">
                                    <span class="visually-hidden">Загрузка документа...</span>
                                </div>
                                <div class="mt-3">Загрузка документа...</div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        } else if (isODF) {
            // ODF документы - пока без поддержки просмотра
            bodyContent = `
                <div class="fullscreen-document-viewer">
                    <div class="document-content d-flex align-items-center justify-content-center">
                        <div class="text-center">
                            <i class="bi bi-file-earmark-text display-1 text-muted"></i>
                            <h5 class="mt-3">Предварительный просмотр ODF документов недоступен</h5>
                            <p class="text-muted">Тип файла: ${material.mimeType}</p>
                            <p class="text-muted">Используйте кнопку "Скачать" для открытия файла в LibreOffice или OpenOffice</p>
                        </div>
                    </div>
                </div>
            `;
        } else {
            // Полноэкранный просмотр текстовых файлов
            bodyContent = `
                <div class="fullscreen-document-viewer">
                    <div class="document-content">
                        <div id="textContainer" style="max-width: 900px; margin: 0 auto; padding: 40px; background: white; min-height: calc(100vh - 40px); font-family: 'Courier New', monospace; line-height: 1.6; box-shadow: 0 0 20px rgba(0,0,0,0.1);">
                            <div class="text-center">
                                <div class="spinner-border text-primary" role="status">
                                    <span class="visually-hidden">Загрузка...</span>
                                </div>
                                <div class="mt-3">Загрузка файла...</div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
    } else {
        bodyContent = `
            <div class="fullscreen-document-viewer">
                <div class="document-content d-flex align-items-center justify-content-center">
                    <div class="text-center">
                        <i class="bi bi-file-earmark display-1 text-muted"></i>
                        <h5 class="mt-3">Предварительный просмотр недоступен</h5>
                        <p class="text-muted">Тип файла: ${material.mimeType}</p>
                        <p class="text-muted">Используйте кнопку "Скачать" для получения файла</p>
                    </div>
                </div>
            </div>
        `;
    }

    modalBody.innerHTML = bodyContent;
    modal.show();

    // Загружаем контент после показа модального окна
    if (material.fileType === 'document') {
        loadDocumentContent(material);
    } else if (material.fileType === 'image') {
        loadImageContent(material.id);
    } else if (material.fileType === 'video') {
        loadVideoContent(material.id, material.mimeType);
    }
}

// Настройка поиска с Fuse.js
function setupFuseSearch() {
    const options = {
        keys: ['title', 'description', 'tags'],
        threshold: 0.3,
        includeScore: true
    };

    fuse = new Fuse(allMaterials, options);
}

// Выполнение поиска
function performSearch() {
    const searchQuery = document.getElementById('searchInput').value.trim();
    const fileType = document.getElementById('fileTypeFilter').value;

    if (searchQuery) {
        // Используем Fuse.js для нечеткого поиска
        const results = fuse.search(searchQuery);
        filteredMaterials = results.map(result => result.item);
    } else {
        filteredMaterials = [...allMaterials];
    }

    // Фильтрация по типу файла
    if (fileType) {
        filteredMaterials = filteredMaterials.filter(material => material.fileType === fileType);
    }

    // Обновляем отображение
    renderFilteredMaterials();
    updateStats();
}

// Отображение отфильтрованных материалов
function renderFilteredMaterials() {
    const container = document.getElementById('materialsList');
    const noMaterials = document.getElementById('noMaterials');
    const loadMoreBtn = document.getElementById('loadMoreBtn');

    container.innerHTML = '';
    // Обновляем класс контейнера в зависимости от устройства
    if (isMobile()) {
        container.className = '';
    } else {
        container.className = 'row g-3';
    }
    loadMoreBtn.style.display = 'none';

    if (filteredMaterials.length === 0) {
        noMaterials.style.display = 'block';
        return;
    } else {
        noMaterials.style.display = 'none';
    }

    filteredMaterials.forEach(material => {
        const materialCard = createMaterialCard(material);
        container.appendChild(materialCard);
    });
}

// Применение сортировки
function applySorting() {
    const sortType = document.getElementById('sortSelect').value;
    const materialsToSort = filteredMaterials.length > 0 ? filteredMaterials : allMaterials;

    switch (sortType) {
        case 'newest':
            materialsToSort.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            break;
        case 'oldest':
            materialsToSort.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
            break;
        case 'popular':
            materialsToSort.sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0));
            break;
        case 'name':
            materialsToSort.sort((a, b) => a.title.localeCompare(b.title, 'ru'));
            break;
    }

    if (filteredMaterials.length > 0) {
        renderFilteredMaterials();
    } else {
        renderMaterials();
    }
}

// Обновление статистики
function updateStats() {
    const materials = filteredMaterials.length > 0 ? filteredMaterials : allMaterials;

    const stats = {
        total: materials.length,
        video: materials.filter(m => m.fileType === 'video').length,
        image: materials.filter(m => m.fileType === 'image').length,
        document: materials.filter(m => m.fileType === 'document').length
    };

    document.getElementById('totalMaterials').textContent = stats.total;
    document.getElementById('videoCount').textContent = stats.video;
    document.getElementById('imageCount').textContent = stats.image;
    document.getElementById('documentCount').textContent = stats.document;
}

// Показ/скрытие лоадера
function showLoader(loaderId, show) {
    const loader = document.getElementById(loaderId);
    if (loader) {
        loader.style.display = show ? 'block' : 'none';
    }
}

// Проверка параметра материала в URL
function checkForMaterialParameter() {
    const urlParams = new URLSearchParams(window.location.search);
    const materialId = urlParams.get('material');

    if (materialId) {
        console.log('Открываем материал из URL:', materialId);
        // Небольшая задержка чтобы интерфейс успел загрузиться
        setTimeout(() => {
            viewMaterial(materialId);
        }, 500);
    }
}

// Показ ошибки
function showError(message) {
    // Простое уведомление об ошибке (можно заменить на toast)
    alert(message);
}

// Выход из системы
function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    PermissionsManager.clear(); // Очищаем права
    window.location.href = '/';
}

// Функция скачивания материала
async function downloadMaterial(materialId) {
    try {
        console.log('Скачиваем материал:', materialId);

        // Получаем токен напрямую из localStorage для надежности
        const token = localStorage.getItem('token');
        if (!token) {
            console.error('❌ Токен не найден в localStorage');
            throw new Error('Токен авторизации не найден');
        }

        console.log('🔑 Используем токен для скачивания материала');

        const response = await fetch(`/api/materials/${materialId}/download`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error(`Ошибка скачивания: ${response.status} ${response.statusText}`);
        }

        // Получаем имя файла из заголовков ответа
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = 'downloaded_file';

        if (contentDisposition) {
            const match = contentDisposition.match(/filename="?([^"]+)"?/);
            if (match) {
                filename = match[1];
            }
        }

        // Создаем blob из ответа
        const blob = await response.blob();

        // Создаем временную ссылку для скачивания
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();

        // Очищаем
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        console.log('Файл скачан успешно');

    } catch (error) {
        console.error('Ошибка скачивания файла:', error);
        showError('Ошибка скачивания файла: ' + error.message);
    }
}

// Функции для мобильного интерфейса
function toggleMobileCategoryTree() {
    const tree = document.getElementById('mobileCategoryTree');
    const toggle = document.getElementById('mobileCategoryToggle');
    const icon = toggle.querySelector('i');

    if (tree.classList.contains('show')) {
        tree.classList.remove('show');
        icon.className = 'bi bi-list';
    } else {
        tree.classList.add('show');
        icon.className = 'bi bi-x';
    }
}

function selectCategoryMobile(categoryId) {
    // Закрываем мобильное дерево после выбора
    const tree = document.getElementById('mobileCategoryTree');
    const toggle = document.getElementById('mobileCategoryToggle');
    const icon = toggle.querySelector('i');

    tree.classList.remove('show');
    icon.className = 'bi bi-list';

    // Выбираем категорию
    selectCategory(categoryId);
}

function performSearchMobile() {
    const searchQuery = document.getElementById('searchInputMobile').value.trim();
    const fileType = document.getElementById('fileTypeFilterMobile').value;

    // Синхронизируем с десктопными полями
    const searchInput = document.getElementById('searchInput');
    const fileTypeFilter = document.getElementById('fileTypeFilter');

    if (searchInput) searchInput.value = searchQuery;
    if (fileTypeFilter) fileTypeFilter.value = fileType;

    // Выполняем поиск
    performSearch();
}

// Обработчик изменения размера окна для переключения между мобильным и десктопным видом
window.addEventListener('resize', function () {
    // Перерендериваем материалы при изменении размера окна
    if (allMaterials.length > 0) {
        renderMaterials();
    }
    if (filteredMaterials.length > 0) {
        renderFilteredMaterials();
    }
});

// Глобальные функции для использования в HTML
window.selectCategory = selectCategory;
window.selectCategoryMobile = selectCategoryMobile;
window.viewMaterial = viewMaterial;
window.downloadMaterial = downloadMaterial;
window.zoomPDF = zoomPDF;
window.closePDFViewer = closePDFViewer;
window.toggleMobileCategoryTree = toggleMobileCategoryTree;

// Загрузка видео с авторизацией
async function loadVideoContent(materialId, mimeType) {
    try {
        console.log('Загружаем видео:', materialId);

        // Получаем токен напрямую из localStorage для надежности
        const token = localStorage.getItem('token');
        if (!token) {
            console.error('❌ Токен не найден в localStorage');
            throw new Error('Токен авторизации не найден');
        }

        console.log('🔑 Используем токен для загрузки видео');

        const response = await fetch(`/api/materials/${materialId}/view`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Ошибка загрузки видео');
        }

        const blob = await response.blob();
        const videoUrl = URL.createObjectURL(blob);

        const videoPlayer = document.getElementById('videoPlayer');
        const videoLoader = document.getElementById('videoLoader');

        if (videoPlayer && videoLoader) {
            videoPlayer.src = videoUrl;
            videoPlayer.type = mimeType;

            videoPlayer.onloadeddata = () => {
                videoLoader.style.display = 'none';
                videoPlayer.style.display = 'block';
                console.log('Видео загружено успешно');
            };

            videoPlayer.onerror = () => {
                console.error('Ошибка загрузки видео');
                videoLoader.innerHTML = `
                    <div class="text-center text-white">
                        <i class="bi bi-exclamation-triangle display-1"></i>
                        <h5 class="mt-3">Ошибка загрузки видео</h5>
                        <p>Не удалось воспроизвести видео файл</p>
                    </div>
                `;
            };

            // Освобождаем URL когда видео не нужно
            videoPlayer.onended = () => {
                URL.revokeObjectURL(videoUrl);
            };
        }

    } catch (error) {
        console.error('Ошибка загрузки видео:', error);
        const videoLoader = document.getElementById('videoLoader');
        if (videoLoader) {
            videoLoader.innerHTML = `
                <div class="text-center text-white">
                    <i class="bi bi-exclamation-triangle display-1"></i>
                    <h5 class="mt-3">Ошибка загрузки видео</h5>
                    <p>Не удалось загрузить видео файл</p>
                </div>
            `;
        }
    }
}

// Загрузка изображения с авторизацией
async function loadImageContent(materialId) {
    try {
        console.log('Загружаем изображение:', materialId);

        // Получаем токен напрямую из localStorage для надежности
        const token = localStorage.getItem('token');
        if (!token) {
            console.error('❌ Токен не найден в localStorage');
            throw new Error('Токен авторизации не найден');
        }

        console.log('🔑 Используем токен для загрузки изображения');

        const response = await fetch(`/api/materials/${materialId}/view`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Ошибка загрузки изображения');
        }

        const blob = await response.blob();
        const imageUrl = URL.createObjectURL(blob);

        const imageViewer = document.getElementById('imageViewer');
        const imageLoader = document.getElementById('imageLoader');

        if (imageViewer && imageLoader) {
            imageViewer.src = imageUrl;
            imageViewer.onload = () => {
                imageLoader.style.display = 'none';
                imageViewer.style.display = 'block';
                // Освобождаем URL после загрузки
                URL.revokeObjectURL(imageUrl);
            };
            imageViewer.onerror = () => {
                imageLoader.innerHTML = `
                    <div class="text-center text-white">
                        <i class="bi bi-exclamation-triangle display-1"></i>
                        <h5 class="mt-3">Ошибка загрузки изображения</h5>
                    </div>
                `;
            };
        }

    } catch (error) {
        console.error('Ошибка загрузки изображения:', error);
        const imageLoader = document.getElementById('imageLoader');
        if (imageLoader) {
            imageLoader.innerHTML = `
                <div class="text-center text-white">
                    <i class="bi bi-exclamation-triangle display-1"></i>
                    <h5 class="mt-3">Ошибка загрузки изображения</h5>
                    <p>Не удалось загрузить изображение</p>
                </div>
            `;
        }
    }
}

// Загрузка контента документа
async function loadDocumentContent(material) {
    const isPDF = material.mimeType === 'application/pdf';
    const isDOCX = material.mimeType.includes('wordprocessingml') || material.originalName?.toLowerCase().endsWith('.docx');
    const isDOC = material.mimeType === 'application/msword' || material.originalName?.toLowerCase().endsWith('.doc');
    const isXLSX = material.mimeType.includes('spreadsheet') || material.mimeType.includes('excel') ||
        material.originalName?.toLowerCase().endsWith('.xlsx') || material.originalName?.toLowerCase().endsWith('.xls');
    const isPPTX = material.mimeType.includes('presentation') || material.mimeType.includes('powerpoint') ||
        material.originalName?.toLowerCase().endsWith('.pptx') || material.originalName?.toLowerCase().endsWith('.ppt');
    const isRTF = material.mimeType === 'application/rtf' || material.mimeType === 'text/rtf' ||
        material.originalName?.toLowerCase().endsWith('.rtf');
    const isText = (material.mimeType.includes('text/') && !isRTF) || material.originalName?.toLowerCase().endsWith('.txt');

    if (isPDF) {
        await loadPDFDocument(material.id);
    } else if (isDOCX) {
        await loadDOCXDocument(material.id);
    } else if (isDOC) {
        await loadDOCDocument(material.id);
    } else if (isXLSX) {
        await loadXLSXDocument(material.id);
    } else if (isPPTX) {
        await loadPPTXDocument(material.id);
    } else if (isRTF) {
        await loadRTFDocument(material.id);
    } else if (isText) {
        await loadTextDocument(material.id);
    }
}

// Загрузка PDF документа с PDF.js - отображение всех страниц
async function loadPDFDocument(materialId) {
    try {
        console.log('Загружаем PDF документ:', materialId);

        // Настраиваем PDF.js
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

        const pagesContainer = document.getElementById('pdfPagesContainer');
        const scrollContainer = document.getElementById('pdfScrollContainer');

        // Получаем токен напрямую из localStorage для надежности
        const token = localStorage.getItem('token');
        if (!token) {
            console.error('❌ Токен не найден в localStorage');
            throw new Error('Токен авторизации не найден');
        }

        console.log('🔑 Используем токен для загрузки PDF');

        // Загружаем PDF
        const response = await fetch(`/api/materials/${materialId}/view`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Ошибка загрузки PDF');
        }

        const arrayBuffer = await response.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        console.log('PDF загружен, страниц:', pdf.numPages);

        // Используем масштаб 100% по умолчанию
        const optimalScale = 1.0;

        // Отображаем информацию о документе
        const totalPagesSpan = document.getElementById('totalPagesSpan');
        const zoomInfo = document.getElementById('zoomInfo');

        if (totalPagesSpan) totalPagesSpan.textContent = `Страниц: ${pdf.numPages}`;
        if (zoomInfo) zoomInfo.textContent = `${Math.round(optimalScale * 100)}%`;

        // Очищаем контейнер
        pagesContainer.innerHTML = '';

        // Рендерим все страницы
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            await renderPDFPageToContainer(pdf, pageNum, optimalScale, pagesContainer);
        }

        // Сохраняем PDF объект для масштабирования
        window.currentPDF = { pdf, scale: optimalScale, totalPages: pdf.numPages, allPages: true };

        // Добавляем обработчики для "хвата" документа
        addPDFDragHandlers(scrollContainer);

        // Добавляем обработчики клавиатуры
        addPDFKeyboardHandlers();

    } catch (error) {
        console.error('Ошибка загрузки PDF:', error);
        const container = document.querySelector('.document-content-wrapper');
        if (container) {
            container.innerHTML = `
                <div class="d-flex align-items-center justify-content-center h-100">
                    <div class="text-center text-white">
                        <i class="bi bi-exclamation-triangle display-1"></i>
                        <h5 class="mt-3">Ошибка загрузки PDF</h5>
                        <p>Не удалось загрузить PDF документ</p>
                    </div>
                </div>
            `;
        }
    }
}

// Загрузка DOCX документа с mammoth.js
async function loadDOCXDocument(materialId) {
    try {
        console.log('Загружаем DOCX документ:', materialId);

        // Получаем токен напрямую из localStorage для надежности
        const token = localStorage.getItem('token');
        if (!token) {
            console.error('❌ Токен не найден в localStorage');
            throw new Error('Токен авторизации не найден');
        }

        console.log('🔑 Используем токен для загрузки DOCX');

        const response = await fetch(`/api/materials/${materialId}/view`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Ошибка загрузки DOCX');
        }

        const arrayBuffer = await response.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer: arrayBuffer });

        console.log('DOCX конвертирован в HTML');

        const container = document.getElementById('docxContainer');
        container.innerHTML = `
            <div style="line-height: 1.8; font-family: 'Times New Roman', serif; font-size: 16px; color: #333;">
                ${result.value}
            </div>
        `;

        if (result.messages.length > 0) {
            console.warn('Предупреждения при конвертации DOCX:', result.messages);
        }

    } catch (error) {
        console.error('Ошибка загрузки DOCX:', error);
        const container = document.getElementById('docxContainer');
        if (container) {
            container.innerHTML = `
                <div class="text-center p-4">
                    <i class="bi bi-exclamation-triangle display-1 text-warning"></i>
                    <h5 class="mt-3">Ошибка загрузки документа</h5>
                    <p class="text-muted">Не удалось загрузить DOCX документ</p>
                </div>
            `;
        }
    }
}

// Загрузка текстового документа
async function loadTextDocument(materialId) {
    try {
        console.log('Загружаем текстовый документ:', materialId);

        // Получаем токен напрямую из localStorage для надежности
        const token = localStorage.getItem('token');
        if (!token) {
            console.error('❌ Токен не найден в localStorage');
            throw new Error('Токен авторизации не найден');
        }

        console.log('🔑 Используем токен для загрузки текстового документа');

        const response = await fetch(`/api/materials/${materialId}/view`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Ошибка загрузки текстового файла');
        }

        const text = await response.text();

        const container = document.getElementById('textContainer');
        container.innerHTML = `<pre style="white-space: pre-wrap; margin: 0; font-size: 14px; color: #333;">${text}</pre>`;

    } catch (error) {
        console.error('Ошибка загрузки текстового файла:', error);
        const container = document.getElementById('textContainer');
        if (container) {
            container.innerHTML = `
                <div class="text-center p-4">
                    <i class="bi bi-exclamation-triangle display-1 text-warning"></i>
                    <h5 class="mt-3">Ошибка загрузки файла</h5>
                    <p class="text-muted">Не удалось загрузить текстовый файл</p>
                </div>
            `;
        }
    }
}

// Загрузка Excel документа (.xlsx, .xls)
async function loadXLSXDocument(materialId) {
    try {
        console.log('Загружаем Excel документ:', materialId);

        const token = localStorage.getItem('token');
        if (!token) {
            console.error('❌ Токен не найден в localStorage');
            throw new Error('Токен авторизации не найден');
        }

        const response = await fetch(`/api/materials/${materialId}/view`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Ошибка загрузки Excel файла');
        }

        const arrayBuffer = await response.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });

        console.log('Excel загружен, листов:', workbook.SheetNames.length);

        const container = document.getElementById('xlsxContainer');

        // Создаём вкладки для листов
        let tabsHtml = '<ul class="nav nav-tabs mb-3" id="excelTabs" role="tablist">';
        let contentHtml = '<div class="tab-content" id="excelTabContent">';

        workbook.SheetNames.forEach((sheetName, index) => {
            const isActive = index === 0;
            const tabId = `sheet-${index}`;

            tabsHtml += `
                <li class="nav-item" role="presentation">
                    <button class="nav-link ${isActive ? 'active' : ''}" id="${tabId}-tab"
                            data-bs-toggle="tab" data-bs-target="#${tabId}" type="button"
                            role="tab" aria-controls="${tabId}" aria-selected="${isActive}">
                        <i class="bi bi-table me-1"></i>${sheetName}
                    </button>
                </li>
            `;

            const worksheet = workbook.Sheets[sheetName];
            const htmlTable = XLSX.utils.sheet_to_html(worksheet, { editable: false });

            contentHtml += `
                <div class="tab-pane fade ${isActive ? 'show active' : ''}" id="${tabId}"
                     role="tabpanel" aria-labelledby="${tabId}-tab">
                    <div class="table-responsive" style="max-height: calc(100vh - 200px); overflow: auto;">
                        ${htmlTable}
                    </div>
                </div>
            `;
        });

        tabsHtml += '</ul>';
        contentHtml += '</div>';

        // Стили для таблицы
        const styles = `
            <style>
                #xlsxContainer table {
                    border-collapse: collapse;
                    width: 100%;
                    background: white;
                    font-size: 14px;
                }
                #xlsxContainer table td, #xlsxContainer table th {
                    border: 1px solid #dee2e6;
                    padding: 8px 12px;
                    text-align: left;
                    white-space: nowrap;
                }
                #xlsxContainer table th {
                    background: #f8f9fa;
                    font-weight: 600;
                    position: sticky;
                    top: 0;
                    z-index: 1;
                }
                #xlsxContainer table tr:nth-child(even) {
                    background: #f8f9fa;
                }
                #xlsxContainer table tr:hover {
                    background: #e9ecef;
                }
                #xlsxContainer .nav-tabs {
                    background: white;
                    padding: 10px 10px 0;
                    border-radius: 8px 8px 0 0;
                }
                #xlsxContainer .nav-link {
                    color: #495057;
                }
                #xlsxContainer .nav-link.active {
                    background: #28a745;
                    color: white;
                    border-color: #28a745;
                }
                #xlsxContainer .tab-content {
                    background: white;
                    border-radius: 0 0 8px 8px;
                    padding: 15px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                }
            </style>
        `;

        container.innerHTML = styles + tabsHtml + contentHtml;

        console.log('Excel отображён успешно');

    } catch (error) {
        console.error('Ошибка загрузки Excel:', error);
        const container = document.getElementById('xlsxContainer');
        if (container) {
            container.innerHTML = `
                <div class="text-center p-4" style="background: white; border-radius: 8px;">
                    <i class="bi bi-exclamation-triangle display-1 text-warning"></i>
                    <h5 class="mt-3">Ошибка загрузки таблицы</h5>
                    <p class="text-muted">Не удалось загрузить Excel документ</p>
                    <p class="text-muted small">${error.message}</p>
                </div>
            `;
        }
    }
}

// Загрузка PowerPoint презентации (.pptx, .ppt)
async function loadPPTXDocument(materialId) {
    try {
        console.log('Загружаем PowerPoint презентацию:', materialId);

        const token = localStorage.getItem('token');
        if (!token) {
            console.error('❌ Токен не найден в localStorage');
            throw new Error('Токен авторизации не найден');
        }

        const response = await fetch(`/api/materials/${materialId}/view`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Ошибка загрузки презентации');
        }

        const arrayBuffer = await response.arrayBuffer();

        // PPTX - это ZIP-архив, используем JSZip для распаковки
        const zip = await JSZip.loadAsync(arrayBuffer);

        // Извлекаем все медиа-файлы (изображения)
        const mediaFiles = {};
        const mediaFolder = zip.folder('ppt/media');
        if (mediaFolder) {
            const mediaEntries = Object.keys(zip.files).filter(name => name.startsWith('ppt/media/'));
            for (const mediaPath of mediaEntries) {
                const file = zip.files[mediaPath];
                if (!file.dir) {
                    const blob = await file.async('blob');
                    const url = URL.createObjectURL(blob);
                    const fileName = mediaPath.split('/').pop();
                    mediaFiles[fileName] = url;
                }
            }
        }
        console.log('Найдено медиа-файлов:', Object.keys(mediaFiles).length);

        // Парсим relationships для каждого слайда
        const slideRels = {};
        const relsFiles = Object.keys(zip.files).filter(name => name.match(/ppt\/slides\/_rels\/slide\d+\.xml\.rels$/));
        for (const relsPath of relsFiles) {
            const slideNum = relsPath.match(/slide(\d+)/)[1];
            const relsXml = await zip.files[relsPath].async('string');
            slideRels[slideNum] = parseRelationships(relsXml, mediaFiles);
        }

        // Находим XML файлы слайдов
        const slideFiles = Object.keys(zip.files)
            .filter(name => name.match(/ppt\/slides\/slide\d+\.xml$/))
            .sort((a, b) => {
                const numA = parseInt(a.match(/slide(\d+)/)[1]);
                const numB = parseInt(b.match(/slide(\d+)/)[1]);
                return numA - numB;
            });

        console.log('Найдено слайдов:', slideFiles.length);

        const container = document.getElementById('pptxContainer');

        if (slideFiles.length === 0) {
            throw new Error('Слайды не найдены в презентации');
        }

        let slidesHtml = `
            <div class="pptx-header mb-4">
                <div class="d-flex justify-content-between align-items-center">
                    <h5 class="text-white mb-0">
                        <i class="bi bi-file-earmark-ppt me-2"></i>
                        Презентация (${slideFiles.length} слайдов)
                    </h5>
                </div>
            </div>
            <div class="slides-container">
        `;

        // Извлекаем контент из каждого слайда
        for (let i = 0; i < slideFiles.length; i++) {
            const slideNum = (i + 1).toString();
            const slideXml = await zip.files[slideFiles[i]].async('string');
            const rels = slideRels[slideNum] || {};
            const slideContent = extractSlideContent(slideXml, rels);

            slidesHtml += `
                <div class="slide-card mb-4">
                    <div class="slide-header">
                        <span class="slide-number">Слайд ${i + 1}</span>
                    </div>
                    <div class="slide-content">
                        ${slideContent.images.length > 0 ? `<div class="slide-images">${slideContent.images.join('')}</div>` : ''}
                        ${slideContent.text || '<p class="text-muted fst-italic">Текст отсутствует</p>'}
                        ${slideContent.shapes.length > 0 ? `<div class="slide-shapes">${slideContent.shapes.join('')}</div>` : ''}
                    </div>
                </div>
            `;
        }

        slidesHtml += '</div>';

        // Стили для презентации
        const styles = `
            <style>
                .slides-container {
                    max-height: calc(100vh - 150px);
                    overflow-y: auto;
                    padding-right: 10px;
                }
                .slide-card {
                    background: white;
                    border-radius: 12px;
                    overflow: hidden;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.2);
                }
                .slide-header {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    padding: 12px 20px;
                    color: white;
                }
                .slide-number {
                    font-weight: 600;
                    font-size: 14px;
                }
                .slide-content {
                    padding: 30px;
                    min-height: 200px;
                    font-size: 16px;
                    line-height: 1.8;
                }
                .slide-content h1, .slide-content h2 {
                    color: #333;
                    margin-bottom: 15px;
                }
                .slide-content p {
                    margin-bottom: 10px;
                    color: #555;
                }
                .slide-content ul {
                    padding-left: 25px;
                }
                .slide-content li {
                    margin-bottom: 8px;
                }
                .slide-images {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 15px;
                    margin-bottom: 20px;
                    justify-content: center;
                }
                .slide-images img {
                    max-width: 100%;
                    max-height: 400px;
                    object-fit: contain;
                    border-radius: 8px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                }
                .slide-shapes {
                    margin-top: 15px;
                    padding: 10px;
                    background: #f8f9fa;
                    border-radius: 8px;
                }
                .slide-shape {
                    display: inline-flex;
                    align-items: center;
                    padding: 8px 15px;
                    margin: 5px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    border-radius: 20px;
                    font-size: 14px;
                }
                .slide-shape i {
                    margin-right: 8px;
                }
                .slides-container::-webkit-scrollbar {
                    width: 8px;
                }
                .slides-container::-webkit-scrollbar-track {
                    background: rgba(255,255,255,0.1);
                    border-radius: 4px;
                }
                .slides-container::-webkit-scrollbar-thumb {
                    background: rgba(255,255,255,0.3);
                    border-radius: 4px;
                }
            </style>
        `;

        container.innerHTML = styles + slidesHtml;

        console.log('Презентация отображена успешно');

    } catch (error) {
        console.error('Ошибка загрузки презентации:', error);
        const container = document.getElementById('pptxContainer');
        if (container) {
            container.innerHTML = `
                <div class="text-center p-4" style="background: white; border-radius: 8px;">
                    <i class="bi bi-exclamation-triangle display-1 text-warning"></i>
                    <h5 class="mt-3">Ошибка загрузки презентации</h5>
                    <p class="text-muted">Не удалось загрузить PowerPoint документ</p>
                    <p class="text-muted small">${error.message}</p>
                </div>
            `;
        }
    }
}

// Парсинг relationships файла слайда
function parseRelationships(relsXml, mediaFiles) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(relsXml, 'text/xml');
    const relationships = {};

    const relElements = xmlDoc.getElementsByTagName('Relationship');
    for (let rel of relElements) {
        const id = rel.getAttribute('Id');
        const target = rel.getAttribute('Target');
        const type = rel.getAttribute('Type');

        if (target && target.includes('../media/')) {
            const mediaName = target.split('/').pop();
            if (mediaFiles[mediaName]) {
                relationships[id] = {
                    url: mediaFiles[mediaName],
                    type: 'image'
                };
            }
        }
    }

    return relationships;
}

// Извлечение контента слайда (текст, изображения, фигуры)
function extractSlideContent(xmlString, relationships) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, 'text/xml');

    const result = {
        text: '',
        images: [],
        shapes: []
    };

    // Извлекаем изображения (blip elements)
    const blipElements = xmlDoc.getElementsByTagName('a:blip');
    for (let blip of blipElements) {
        const embedId = blip.getAttribute('r:embed');
        if (embedId && relationships[embedId]) {
            result.images.push(`<img src="${relationships[embedId].url}" alt="Изображение слайда">`);
        }
    }

    // Извлекаем фигуры (shapes)
    const spElements = xmlDoc.getElementsByTagName('p:sp');
    for (let sp of spElements) {
        // Проверяем тип фигуры
        const nvSpPr = sp.getElementsByTagName('p:nvSpPr')[0];
        if (nvSpPr) {
            const cNvSpPr = nvSpPr.getElementsByTagName('p:cNvSpPr')[0];
            // Если это не текстовый блок, а фигура
            if (cNvSpPr) {
                const prstGeom = sp.getElementsByTagName('a:prstGeom')[0];
                if (prstGeom) {
                    const shapeType = prstGeom.getAttribute('prst');
                    if (shapeType && !['rect', 'textBox'].includes(shapeType)) {
                        const shapeName = getShapeName(shapeType);
                        const shapeText = extractShapeText(sp);
                        result.shapes.push(`<span class="slide-shape"><i class="bi bi-diagram-3"></i>${shapeName}${shapeText ? ': ' + shapeText : ''}</span>`);
                    }
                }
            }
        }
    }

    // Извлекаем текст
    const paragraphs = [];
    const pElements = xmlDoc.getElementsByTagName('a:p');

    for (let p of pElements) {
        const texts = p.getElementsByTagName('a:t');
        let paragraphText = '';

        for (let t of texts) {
            paragraphText += t.textContent || '';
        }

        if (paragraphText.trim()) {
            paragraphs.push(paragraphText.trim());
        }
    }

    if (paragraphs.length > 0) {
        result.text = `<h2>${escapeHtml(paragraphs[0])}</h2>`;

        if (paragraphs.length > 1) {
            result.text += '<ul>';
            for (let i = 1; i < paragraphs.length; i++) {
                result.text += `<li>${escapeHtml(paragraphs[i])}</li>`;
            }
            result.text += '</ul>';
        }
    }

    return result;
}

// Извлечение текста из фигуры
function extractShapeText(shapeElement) {
    const texts = shapeElement.getElementsByTagName('a:t');
    let text = '';
    for (let t of texts) {
        text += t.textContent || '';
    }
    return text.trim();
}

// Получение читаемого названия фигуры
function getShapeName(shapeType) {
    const shapeNames = {
        'arrow': 'Стрелка',
        'rightArrow': 'Стрелка вправо',
        'leftArrow': 'Стрелка влево',
        'upArrow': 'Стрелка вверх',
        'downArrow': 'Стрелка вниз',
        'leftRightArrow': 'Двойная стрелка',
        'upDownArrow': 'Вертикальная стрелка',
        'bentArrow': 'Изогнутая стрелка',
        'curvedRightArrow': 'Изогнутая стрелка',
        'curvedLeftArrow': 'Изогнутая стрелка',
        'ellipse': 'Овал',
        'triangle': 'Треугольник',
        'rtTriangle': 'Прямоугольный треугольник',
        'parallelogram': 'Параллелограмм',
        'trapezoid': 'Трапеция',
        'diamond': 'Ромб',
        'pentagon': 'Пятиугольник',
        'hexagon': 'Шестиугольник',
        'heptagon': 'Семиугольник',
        'octagon': 'Восьмиугольник',
        'star4': 'Звезда (4)',
        'star5': 'Звезда (5)',
        'star6': 'Звезда (6)',
        'star8': 'Звезда (8)',
        'roundRect': 'Скруглённый прямоугольник',
        'snip1Rect': 'Прямоугольник со срезом',
        'snip2Rect': 'Прямоугольник с двумя срезами',
        'cloud': 'Облако',
        'heart': 'Сердце',
        'lightningBolt': 'Молния',
        'sun': 'Солнце',
        'moon': 'Луна',
        'smileyFace': 'Смайлик',
        'line': 'Линия',
        'straightConnector1': 'Соединительная линия',
        'bentConnector3': 'Угловой соединитель',
        'curvedConnector3': 'Изогнутый соединитель',
        'callout1': 'Выноска',
        'callout2': 'Выноска',
        'callout3': 'Выноска',
        'accentCallout1': 'Акцентная выноска',
        'flowChartProcess': 'Блок процесса',
        'flowChartDecision': 'Блок решения',
        'flowChartTerminator': 'Блок терминатора',
        'flowChartConnector': 'Соединитель',
        'actionButtonBlank': 'Кнопка',
        'mathPlus': 'Плюс',
        'mathMinus': 'Минус',
        'mathMultiply': 'Умножить',
        'mathDivide': 'Разделить',
        'mathEqual': 'Равно',
        'mathNotEqual': 'Не равно',
        'bracketPair': 'Скобки',
        'bracePair': 'Фигурные скобки',
        'chevron': 'Шеврон',
        'homePlate': 'Пятиугольник',
        'ribbon': 'Лента',
        'ribbon2': 'Лента 2',
        'wave': 'Волна',
        'doubleWave': 'Двойная волна'
    };

    return shapeNames[shapeType] || `Фигура (${shapeType})`;
}

// Экранирование HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Загрузка старого формата Word (.doc)
async function loadDOCDocument(materialId) {
    try {
        console.log('Загружаем DOC документ:', materialId);

        const token = localStorage.getItem('token');
        if (!token) {
            console.error('❌ Токен не найден в localStorage');
            throw new Error('Токен авторизации не найден');
        }

        const response = await fetch(`/api/materials/${materialId}/view`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Ошибка загрузки документа');
        }

        const arrayBuffer = await response.arrayBuffer();

        // Пробуем использовать mammoth.js (работает только для .docx, но попробуем)
        try {
            const result = await mammoth.convertToHtml({ arrayBuffer: arrayBuffer });

            if (result.value && result.value.trim()) {
                const container = document.getElementById('docContainer');
                container.innerHTML = `
                    <div style="line-height: 1.8; font-family: 'Times New Roman', serif; font-size: 16px; color: #333;">
                        ${result.value}
                    </div>
                `;

                if (result.messages.length > 0) {
                    console.warn('Предупреждения при конвертации DOC:', result.messages);
                }

                console.log('DOC документ загружен через mammoth');
                return;
            }
        } catch (mammothError) {
            console.log('Mammoth не смог обработать .doc файл:', mammothError.message);
        }

        // Если mammoth не сработал, показываем сообщение
        const container = document.getElementById('docContainer');
        container.innerHTML = `
            <div class="text-center p-4">
                <i class="bi bi-file-earmark-word display-1 text-primary"></i>
                <h5 class="mt-3">Формат .doc не поддерживается для просмотра</h5>
                <p class="text-muted">Старый формат Microsoft Word 97-2003 (.doc) не может быть отображён в браузере.</p>
                <p class="text-muted">Пожалуйста, скачайте файл и откройте его в Microsoft Word или LibreOffice.</p>
                <button class="btn btn-primary mt-3" onclick="downloadMaterial(${materialId})">
                    <i class="bi bi-download me-2"></i>Скачать документ
                </button>
            </div>
        `;

    } catch (error) {
        console.error('Ошибка загрузки DOC:', error);
        const container = document.getElementById('docContainer');
        if (container) {
            container.innerHTML = `
                <div class="text-center p-4">
                    <i class="bi bi-exclamation-triangle display-1 text-warning"></i>
                    <h5 class="mt-3">Ошибка загрузки документа</h5>
                    <p class="text-muted">Не удалось загрузить документ</p>
                    <p class="text-muted small">${error.message}</p>
                </div>
            `;
        }
    }
}

// Загрузка RTF документа
async function loadRTFDocument(materialId) {
    try {
        console.log('Загружаем RTF документ:', materialId);

        const token = localStorage.getItem('token');
        if (!token) {
            console.error('❌ Токен не найден в localStorage');
            throw new Error('Токен авторизации не найден');
        }

        const response = await fetch(`/api/materials/${materialId}/view`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Ошибка загрузки RTF документа');
        }

        const rtfContent = await response.text();
        const container = document.getElementById('rtfContainer');

        // Конвертируем RTF в HTML
        const htmlContent = convertRTFtoHTML(rtfContent);

        container.innerHTML = `
            <div style="line-height: 1.8; font-family: 'Times New Roman', serif; font-size: 16px; color: #333;">
                ${htmlContent}
            </div>
        `;

        console.log('RTF документ загружен успешно');

    } catch (error) {
        console.error('Ошибка загрузки RTF:', error);
        const container = document.getElementById('rtfContainer');
        if (container) {
            container.innerHTML = `
                <div class="text-center p-4">
                    <i class="bi bi-exclamation-triangle display-1 text-warning"></i>
                    <h5 class="mt-3">Ошибка загрузки документа</h5>
                    <p class="text-muted">Не удалось загрузить RTF документ</p>
                    <p class="text-muted small">${error.message}</p>
                    <button class="btn btn-primary mt-3" onclick="downloadMaterial(${materialId})">
                        <i class="bi bi-download me-2"></i>Скачать документ
                    </button>
                </div>
            `;
        }
    }
}

// Базовый конвертер RTF в HTML
function convertRTFtoHTML(rtf) {
    // Проверяем, что это RTF
    if (!rtf.startsWith('{\\rtf')) {
        return `<pre>${escapeHtml(rtf)}</pre>`;
    }

    let html = '';
    let text = '';
    let inGroup = 0;
    let skipGroup = 0;
    let bold = false;
    let italic = false;
    let underline = false;

    // Убираем заголовок RTF и служебные группы
    let i = 0;
    while (i < rtf.length) {
        const char = rtf[i];

        if (char === '{') {
            inGroup++;
            // Проверяем на служебные группы, которые нужно пропустить
            const nextChars = rtf.substring(i + 1, i + 20);
            if (nextChars.startsWith('\\fonttbl') ||
                nextChars.startsWith('\\colortbl') ||
                nextChars.startsWith('\\stylesheet') ||
                nextChars.startsWith('\\info') ||
                nextChars.startsWith('\\*\\') ||
                nextChars.startsWith('\\pict')) {
                skipGroup = inGroup;
            }
            i++;
            continue;
        }

        if (char === '}') {
            if (skipGroup === inGroup) {
                skipGroup = 0;
            }
            inGroup--;
            i++;
            continue;
        }

        if (skipGroup > 0) {
            i++;
            continue;
        }

        if (char === '\\') {
            // Управляющее слово
            let word = '';
            i++;
            while (i < rtf.length && /[a-z-]/.test(rtf[i])) {
                word += rtf[i];
                i++;
            }

            // Числовой параметр
            let param = '';
            while (i < rtf.length && /[0-9-]/.test(rtf[i])) {
                param += rtf[i];
                i++;
            }

            // Пробел после управляющего слова
            if (rtf[i] === ' ') {
                i++;
            }

            // Обрабатываем управляющие слова
            switch (word) {
                case 'par':
                case 'line':
                    text += '<br>';
                    break;
                case 'tab':
                    text += '&emsp;';
                    break;
                case 'b':
                    if (param === '0') {
                        if (bold) { text += '</b>'; bold = false; }
                    } else {
                        if (!bold) { text += '<b>'; bold = true; }
                    }
                    break;
                case 'i':
                    if (param === '0') {
                        if (italic) { text += '</i>'; italic = false; }
                    } else {
                        if (!italic) { text += '<i>'; italic = true; }
                    }
                    break;
                case 'ul':
                    if (!underline) { text += '<u>'; underline = true; }
                    break;
                case 'ulnone':
                    if (underline) { text += '</u>'; underline = false; }
                    break;
                case 'u':
                    // Unicode символ
                    if (param) {
                        const code = parseInt(param);
                        if (code < 0) {
                            text += String.fromCharCode(code + 65536);
                        } else {
                            text += String.fromCharCode(code);
                        }
                        // Пропускаем заменяющий символ
                        if (rtf[i] === '?') i++;
                    }
                    break;
                case '':
                    // Экранированные символы
                    if (rtf[i - 1] === '\\') {
                        text += '\\';
                    }
                    break;
            }

            // Специальные экранированные символы
            if (rtf[i - word.length - param.length - 1] === '\\') {
                const escaped = rtf[i - word.length - param.length];
                if (escaped === '{' || escaped === '}' || escaped === '\\') {
                    // Уже обработано выше
                }
            }

            continue;
        }

        // Обычный текст
        if (char === '\r' || char === '\n') {
            i++;
            continue;
        }

        text += escapeHtml(char);
        i++;
    }

    // Закрываем незакрытые теги
    if (bold) text += '</b>';
    if (italic) text += '</i>';
    if (underline) text += '</u>';

    // Разбиваем на параграфы
    html = text.split('<br><br>').map(p => p.trim()).filter(p => p).map(p => `<p>${p}</p>`).join('');

    if (!html) {
        html = `<p>${text}</p>`;
    }

    return html || '<p class="text-muted fst-italic">Документ пуст или не удалось извлечь текст</p>';
}

// Функции для управления PDF
function zoomPDF(action) {
    if (!window.currentPDF) return;

    const { pdf, allPages } = window.currentPDF;
    let { scale } = window.currentPDF;

    switch (action) {
        case 'in':
            scale = Math.min(scale * 1.2, 5.0); // Максимум 500%
            break;
        case 'out':
            scale = Math.max(scale * 0.8, 0.25); // Минимум 25%
            break;
        case 'reset':
            // Сбрасываем масштаб к 100%
            scale = 1.0;
            break;
    }

    window.currentPDF.scale = scale;

    // Обновляем информацию о масштабе
    const zoomInfo = document.getElementById('zoomInfo');
    if (zoomInfo) zoomInfo.textContent = `${Math.round(scale * 100)}%`;

    // Перерисовываем все страницы или одну страницу
    if (allPages) {
        rerenderAllPDFPages();
    } else {
        renderPDFPage(pdf, window.currentPDF.page, scale);
    }
}

// Перерисовка всех страниц PDF с новым масштабом
async function rerenderAllPDFPages() {
    if (!window.currentPDF || !window.currentPDF.allPages) return;

    const { pdf, scale } = window.currentPDF;
    const pagesContainer = document.getElementById('pdfPagesContainer');

    if (!pagesContainer) return;

    // Очищаем контейнер
    pagesContainer.innerHTML = '';

    // Рендерим все страницы с новым масштабом
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        await renderPDFPageToContainer(pdf, pageNum, scale, pagesContainer);
    }

    console.log('Все страницы перерендерены с масштабом:', Math.round(scale * 100) + '%');
}

// Рендеринг страницы PDF в контейнер
async function renderPDFPageToContainer(pdf, pageNum, scale, container) {
    try {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale });

        // Создаем canvas для страницы
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        canvas.height = viewport.height;
        canvas.width = viewport.width;
        canvas.style.cssText = `
            display: block;
            margin: 0 auto;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            border-radius: 4px;
            background: white;
        `;

        // Добавляем номер страницы как data-атрибут
        canvas.dataset.pageNumber = pageNum;

        const renderContext = {
            canvasContext: context,
            viewport: viewport
        };

        await page.render(renderContext).promise;

        // Добавляем canvas в контейнер
        container.appendChild(canvas);

        console.log(`Страница ${pageNum} отрендерена`);

    } catch (error) {
        console.error(`Ошибка рендеринга страницы ${pageNum}:`, error);
    }
}

// Отрисовка страницы PDF (для совместимости со старым кодом)
async function renderPDFPage(pdf, pageNum, scale) {
    try {
        const canvas = document.getElementById('pdfCanvas');
        const context = canvas.getContext('2d');
        const currentPageInput = document.getElementById('currentPageInput');
        const zoomInfo = document.getElementById('zoomInfo');
        const prevPageBtn = document.getElementById('prevPageBtn');
        const nextPageBtn = document.getElementById('nextPageBtn');

        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale });

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
            canvasContext: context,
            viewport: viewport
        };

        await page.render(renderContext).promise;

        // Обновляем UI элементы
        if (currentPageInput) currentPageInput.value = pageNum;
        if (zoomInfo) zoomInfo.textContent = `${Math.round(scale * 100)}%`;

        // Обновляем состояние кнопок навигации
        if (prevPageBtn) prevPageBtn.disabled = pageNum <= 1;
        if (nextPageBtn) nextPageBtn.disabled = pageNum >= pdf.numPages;

        // Обновляем текущие данные
        if (window.currentPDF) {
            window.currentPDF.page = pageNum;
            window.currentPDF.scale = scale;
        }

    } catch (error) {
        console.error('Ошибка отрисовки PDF:', error);
    }
}

// Изменение страницы PDF
function changePDFPage(direction) {
    if (!window.currentPDF) return;

    const { pdf, page, scale, totalPages } = window.currentPDF;
    const newPage = page + direction;

    if (newPage >= 1 && newPage <= totalPages) {
        renderPDFPage(pdf, newPage, scale);
    }
}

// Переход к конкретной странице
function goToPage(pageNum) {
    if (!window.currentPDF) return;

    const { pdf, scale, totalPages } = window.currentPDF;
    const targetPage = parseInt(pageNum);

    if (targetPage >= 1 && targetPage <= totalPages) {
        renderPDFPage(pdf, targetPage, scale);
    } else {
        // Возвращаем корректное значение в поле ввода
        const currentPageInput = document.getElementById('currentPageInput');
        if (currentPageInput) {
            currentPageInput.value = window.currentPDF.page;
        }
    }
}

// Добавление обработчиков клавиатуры для PDF
function addPDFKeyboardHandlers() {
    // Удаляем старые обработчики
    document.removeEventListener('keydown', handlePDFKeydown);

    // Добавляем новый обработчик
    document.addEventListener('keydown', handlePDFKeydown);
}

// Обработка нажатий клавиш для PDF
function handlePDFKeydown(event) {
    if (!window.currentPDF) return;

    // Игнорируем, если фокус в поле ввода
    if (document.activeElement.tagName === 'INPUT') return;

    const container = document.getElementById('pdfScrollContainer');

    switch (event.key) {
        case 'ArrowUp':
        case 'PageUp':
            event.preventDefault();
            if (container) {
                container.scrollTop -= container.clientHeight * 0.8;
            }
            break;
        case 'ArrowDown':
        case 'PageDown':
            event.preventDefault();
            if (container) {
                container.scrollTop += container.clientHeight * 0.8;
            }
            break;
        case 'ArrowLeft':
            event.preventDefault();
            if (container) {
                container.scrollLeft -= 100;
            }
            break;
        case 'ArrowRight':
            event.preventDefault();
            if (container) {
                container.scrollLeft += 100;
            }
            break;
        case 'Home':
            event.preventDefault();
            if (container) {
                container.scrollTop = 0;
            }
            break;
        case 'End':
            event.preventDefault();
            if (container) {
                container.scrollTop = container.scrollHeight;
            }
            break;
        case '+':
        case '=':
            if (event.ctrlKey) {
                event.preventDefault();
                zoomPDF('in');
            }
            break;
        case '-':
            if (event.ctrlKey) {
                event.preventDefault();
                zoomPDF('out');
            }
            break;
        case '0':
            if (event.ctrlKey) {
                event.preventDefault();
                zoomPDF('reset');
            }
            break;
        case 'Escape':
            event.preventDefault();
            closePDFViewer();
            break;
    }
}

// Удаление обработчиков клавиатуры при закрытии PDF
function removePDFKeyboardHandlers() {
    document.removeEventListener('keydown', handlePDFKeydown);
    window.currentPDF = null;
}

// Закрытие PDF просмотрщика
function closePDFViewer() {
    const modal = bootstrap.Modal.getInstance(document.getElementById('materialModal'));
    if (modal) {
        modal.hide();
    }
}

// Добавление обработчиков для "хвата" документа
function addPDFDragHandlers(container) {
    let isDragging = false;
    let startX, startY;
    let scrollLeft, scrollTop;

    // Обработчики для мыши
    container.addEventListener('mousedown', (e) => {
        // Игнорируем правый клик
        if (e.button !== 0) return;

        isDragging = true;
        container.style.cursor = 'grabbing';

        startX = e.pageX - container.offsetLeft;
        startY = e.pageY - container.offsetTop;
        scrollLeft = container.scrollLeft;
        scrollTop = container.scrollTop;

        // Предотвращаем выделение текста
        e.preventDefault();
    });

    container.addEventListener('mouseleave', () => {
        isDragging = false;
        container.style.cursor = 'grab';
    });

    container.addEventListener('mouseup', () => {
        isDragging = false;
        container.style.cursor = 'grab';
    });

    container.addEventListener('mousemove', (e) => {
        if (!isDragging) return;

        e.preventDefault();

        const x = e.pageX - container.offsetLeft;
        const y = e.pageY - container.offsetTop;
        const walkX = (x - startX) * 2; // Коэффициент скорости прокрутки
        const walkY = (y - startY) * 2;

        container.scrollLeft = scrollLeft - walkX;
        container.scrollTop = scrollTop - walkY;
    });

    // Обработчики для сенсорных устройств
    let touchStartX, touchStartY;
    let touchScrollLeft, touchScrollTop;

    container.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;

        const touch = e.touches[0];
        touchStartX = touch.pageX;
        touchStartY = touch.pageY;
        touchScrollLeft = container.scrollLeft;
        touchScrollTop = container.scrollTop;
    }, { passive: true });

    container.addEventListener('touchmove', (e) => {
        if (e.touches.length !== 1) return;

        const touch = e.touches[0];
        const walkX = touchStartX - touch.pageX;
        const walkY = touchStartY - touch.pageY;

        container.scrollLeft = touchScrollLeft + walkX;
        container.scrollTop = touchScrollTop + walkY;
    }, { passive: true });

    // Поддержка колесика мыши для горизонтальной прокрутки
    container.addEventListener('wheel', (e) => {
        // Если зажат Shift, прокручиваем горизонтально
        if (e.shiftKey) {
            e.preventDefault();
            container.scrollLeft += e.deltaY;
        }
    });
} 