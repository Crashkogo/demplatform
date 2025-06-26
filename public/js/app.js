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
        // Проверяем авторизацию
        if (!checkAuth()) {
            window.location.href = '/';
            return;
        }

        // Инициализируем компоненты
        initializeEventListeners();
        await loadCategories();
        await loadMaterials();
        setupFuseSearch();

        // Проверяем, есть ли параметр материала в URL
        checkForMaterialParameter();

        console.log('Приложение инициализировано');
    } catch (error) {
        console.error('Ошибка инициализации:', error);
        showError('Ошибка загрузки приложения');
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
        document.getElementById('userRole').textContent = `Роль: ${currentUser.role === 'admin' ? 'Администратор' : 'Клиент'}`;

        // Показываем кнопки админ-панели только для администраторов
        if (currentUser.role === 'admin') {
            const adminPanelBtn = document.getElementById('adminPanelBtn');
            const adminMenuLink = document.getElementById('adminMenuLink');
            const adminMenuDivider = document.getElementById('adminMenuDivider');

            if (adminPanelBtn) adminPanelBtn.style.display = 'block';
            if (adminMenuLink) adminMenuLink.style.display = 'block';
            if (adminMenuDivider) adminMenuDivider.style.display = 'block';
        }

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
    const treeData = convertToJsTreeFormat(categories);

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
        id: category._id,
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
        console.log('Загружаем материалы, append:', append, 'currentCategoryId:', currentCategoryId);

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

        console.log('Параметры запроса:', params);
        console.log('Текущий пользователь и токен:', { user: currentUser, hasToken: !!currentToken });

        const response = await axios.get('/api/materials', { params });

        console.log('Ответ от сервера:', response.data);

        if (response.data.success) {
            const materials = response.data.data;
            console.log('Загружено материалов:', materials.length);

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
            loadMoreBtn.style.display = hasMoreMaterials ? 'block' : 'none';

        } else {
            console.error('Ошибка от сервера:', response.data.message);
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
                <button class="btn btn-outline-primary compact-btn" onclick="viewMaterial('${material._id}')" title="Просмотр">
                    <i class="bi bi-eye"></i>
                </button>
                <button class="btn btn-outline-success compact-btn" onclick="downloadMaterial('${material._id}')" title="Скачать">
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
                            <small class="text-muted">${material.categoryId?.name || 'Без категории'}</small>
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
                        <button class="btn btn-outline-primary btn-sm flex-grow-1" onclick="viewMaterial('${material._id}')">
                            <i class="bi bi-eye me-1"></i>Просмотр
                        </button>
                        <button class="btn btn-outline-success btn-sm" onclick="downloadMaterial('${material._id}')">
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
    const modal = new bootstrap.Modal(document.getElementById('materialModal'));
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    const downloadBtn = document.getElementById('downloadBtn');

    modalTitle.textContent = material.title;

    // Удаляем старые обработчики и добавляем новый для скачивания
    downloadBtn.onclick = () => downloadMaterial(material._id);

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
        const isDOCX = material.mimeType.includes('wordprocessingml') || material.originalName?.toLowerCase().includes('.docx');
        const isOfficeDoc = material.mimeType.includes('word') || material.mimeType.includes('excel') || material.mimeType.includes('powerpoint') ||
            material.mimeType.includes('opendocument') || material.originalName?.includes('.doc') ||
            material.originalName?.includes('.xls') || material.originalName?.includes('.ppt') ||
            material.originalName?.includes('.odt') || material.originalName?.includes('.ods') || material.originalName?.includes('.odp');

        if (isPDF) {
            // Полноэкранный PDF просмотрщик
            bodyContent = `
                <div class="fullscreen-document-viewer">
                    <div class="pdf-controls">
                        <button type="button" class="btn btn-outline-light btn-sm" onclick="zoomPDF('out', '${material._id}')">
                            <i class="bi bi-zoom-out"></i> Уменьшить
                        </button>
                        <button type="button" class="btn btn-outline-light btn-sm" onclick="zoomPDF('reset', '${material._id}')">
                            <i class="bi bi-arrows-fullscreen"></i> По размеру
                        </button>
                        <button type="button" class="btn btn-outline-light btn-sm" onclick="zoomPDF('in', '${material._id}')">
                            <i class="bi bi-zoom-in"></i> Увеличить
                        </button>
                        <span class="text-white ms-3" id="pdfInfo">Загрузка...</span>
                    </div>
                    <div class="document-content d-flex justify-content-center" style="padding: 0;">
                        <canvas id="pdfCanvas"></canvas>
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
        } else if (isOfficeDoc) {
            // Полноэкранный iframe для офисных документов
            bodyContent = `
                <div class="fullscreen-document-viewer">
                    <div class="document-content" style="padding: 0;">
                        <iframe src="/api/materials/${material._id}/view" 
                                title="${material.title}">
                        </iframe>
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
        loadImageContent(material._id);
    } else if (material.fileType === 'video') {
        loadVideoContent(material._id, material.mimeType);
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
    window.location.href = '/';
}

// Функция скачивания материала
async function downloadMaterial(materialId) {
    try {
        console.log('Скачиваем материал:', materialId);

        const response = await fetch(`/api/materials/${materialId}/download`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${currentToken}`
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
window.toggleMobileCategoryTree = toggleMobileCategoryTree;

// Загрузка видео с авторизацией
async function loadVideoContent(materialId, mimeType) {
    try {
        console.log('Загружаем видео:', materialId);

        const response = await fetch(`/api/materials/${materialId}/view`, {
            headers: {
                'Authorization': `Bearer ${currentToken}`
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

        const response = await fetch(`/api/materials/${materialId}/view`, {
            headers: {
                'Authorization': `Bearer ${currentToken}`
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
    const isDOCX = material.mimeType.includes('wordprocessingml') || material.originalName?.toLowerCase().includes('.docx');
    const isText = material.mimeType.includes('text/') || material.originalName?.toLowerCase().includes('.txt');

    if (isPDF) {
        await loadPDFDocument(material._id);
    } else if (isDOCX) {
        await loadDOCXDocument(material._id);
    } else if (isText) {
        await loadTextDocument(material._id);
    }
}

// Загрузка PDF документа с PDF.js
async function loadPDFDocument(materialId) {
    try {
        console.log('Загружаем PDF документ:', materialId);

        // Настраиваем PDF.js
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

        const canvas = document.getElementById('pdfCanvas');
        const context = canvas.getContext('2d');
        const pdfInfo = document.getElementById('pdfInfo');

        // Загружаем PDF
        const response = await fetch(`/api/materials/${materialId}/view`, {
            headers: {
                'Authorization': `Bearer ${currentToken}`
            }
        });

        if (!response.ok) {
            throw new Error('Ошибка загрузки PDF');
        }

        const arrayBuffer = await response.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        console.log('PDF загружен, страниц:', pdf.numPages);

        // Определяем оптимальный масштаб для полноэкранного просмотра
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1.0 });

        // Вычисляем масштаб для подгонки под экран (с небольшим отступом)
        const maxWidth = window.innerWidth * 0.9;
        const maxHeight = (window.innerHeight - 150) * 0.9; // Учитываем панель управления

        const scaleX = maxWidth / viewport.width;
        const scaleY = maxHeight / viewport.height;
        const optimalScale = Math.min(scaleX, scaleY, 2.0); // Максимум 200%

        // Отображаем первую страницу с оптимальным масштабом
        const scaledViewport = page.getViewport({ scale: optimalScale });

        canvas.height = scaledViewport.height;
        canvas.width = scaledViewport.width;

        const renderContext = {
            canvasContext: context,
            viewport: scaledViewport
        };

        await page.render(renderContext).promise;

        pdfInfo.textContent = `Страница 1 из ${pdf.numPages} (${Math.round(optimalScale * 100)}%)`;

        // Сохраняем PDF объект для масштабирования
        window.currentPDF = { pdf, page: 1, scale: optimalScale };

    } catch (error) {
        console.error('Ошибка загрузки PDF:', error);
        const container = document.querySelector('.document-content');
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

        const response = await fetch(`/api/materials/${materialId}/view`, {
            headers: {
                'Authorization': `Bearer ${currentToken}`
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

        const response = await fetch(`/api/materials/${materialId}/view`, {
            headers: {
                'Authorization': `Bearer ${currentToken}`
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

// Функции для управления PDF
function zoomPDF(action, materialId) {
    if (!window.currentPDF) return;

    const { pdf, page } = window.currentPDF;
    let { scale } = window.currentPDF;

    switch (action) {
        case 'in':
            scale *= 1.2;
            break;
        case 'out':
            scale /= 1.2;
            break;
        case 'reset':
            scale = 1.2;
            break;
    }

    // Ограничиваем масштаб
    scale = Math.max(0.5, Math.min(3.0, scale));
    window.currentPDF.scale = scale;

    // Перерисовываем страницу
    renderPDFPage(pdf, page, scale);
}

// Отрисовка страницы PDF
async function renderPDFPage(pdf, pageNum, scale) {
    try {
        const canvas = document.getElementById('pdfCanvas');
        const context = canvas.getContext('2d');
        const pdfInfo = document.getElementById('pdfInfo');

        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale });

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
            canvasContext: context,
            viewport: viewport
        };

        await page.render(renderContext).promise;

        if (pdfInfo) {
            pdfInfo.textContent = `Страница ${pageNum} из ${pdf.numPages} (${Math.round(scale * 100)}%)`;
        }

    } catch (error) {
        console.error('Ошибка отрисовки PDF:', error);
    }
} 