// Настройка Axios — withCredentials нужен чтобы cookie отправлялась при запросах
axios.defaults.baseURL = window.location.origin;
axios.defaults.withCredentials = true;
axios.defaults.headers.common['Content-Type'] = 'application/json';

// Элементы DOM
const loginForm = document.getElementById('loginForm');
const loginBtn = document.getElementById('loginBtn');
const alertContainer = document.getElementById('alertContainer');
const togglePasswordBtn = document.getElementById('togglePassword');
const passwordInput = document.getElementById('password');

// Переключение видимости пароля
togglePasswordBtn.addEventListener('click', function () {
    const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
    passwordInput.setAttribute('type', type);

    const icon = this.querySelector('i');
    icon.className = type === 'password' ? 'bi bi-eye' : 'bi bi-eye-slash';
});

// Функция показа алерта
function showAlert(message, type = 'danger') {
    alertContainer.innerHTML = `
        <div class="alert alert-${type} alert-dismissible fade show" role="alert">
            <i class="bi bi-${type === 'danger' ? 'exclamation-triangle' : 'check-circle'} me-2"></i>
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `;
}

// Функция управления состоянием загрузки
function setLoading(isLoading) {
    const loginText = loginBtn.querySelector('.login-text');
    const loadingText = loginBtn.querySelector('.loading-text');

    if (isLoading) {
        loginBtn.classList.add('loading');
        loginText.classList.add('d-none');
        loadingText.classList.remove('d-none');
    } else {
        loginBtn.classList.remove('loading');
        loginText.classList.remove('d-none');
        loadingText.classList.add('d-none');
    }
}

// Обработка формы логина
loginForm.addEventListener('submit', async function (e) {
    e.preventDefault();

    const formData = new FormData(this);
    const credentials = {
        login: formData.get('login').trim(),
        password: formData.get('password')
    };

    // Базовая валидация
    if (!credentials.login || !credentials.password) {
        showAlert('Пожалуйста, заполните все поля');
        return;
    }

    setLoading(true);
    alertContainer.innerHTML = '';

    try {
        const response = await axios.post('/api/auth/login', credentials);

        if (response.data.success) {
            // Токен сохраняется сервером в httpOnly cookie автоматически
            localStorage.setItem('user', JSON.stringify(response.data.user));

            // Устанавливаем права в менеджере, передавая весь объект пользователя
            PermissionsManager.setPermissions(response.data.user);

            showAlert('Успешная авторизация! Перенаправление...', 'success');

            setTimeout(() => {
                window.location.href = '/app';
            }, 1000);
        } else {
            showAlert(response.data.message || 'Ошибка авторизации');
        }
    } catch (error) {
        if (error.response && error.response.data) {
            showAlert(error.response.data.message || 'Ошибка авторизации');
        } else if (error.request) {
            showAlert('Ошибка соединения с сервером');
        } else {
            showAlert('Произошла неожиданная ошибка');
        }
    } finally {
        setLoading(false);
    }
});

// Проверка существующей авторизации при загрузке страницы
window.addEventListener('DOMContentLoaded', async function () {
    try {
        const response = await axios.get('/api/auth/me');
        if (response.data.success && response.data.user) {
            const user = response.data.user;
            if (user.Role?.isAdmin || user.Role?.canViewUsers || user.Role?.canManageRoles) {
                window.location.href = '/admin';
            } else {
                window.location.href = '/app';
            }
        }
    } catch (error) {
        // 401 — не авторизован, остаёмся на странице входа
        localStorage.removeItem('user');
    }
});

// Автозаполнение для демо (Ctrl+D)
document.addEventListener('keydown', function (e) {
    if (e.ctrlKey && e.key === 'd') {
        e.preventDefault();
        document.getElementById('login').value = 'admin';
        document.getElementById('password').value = 'admin123';
    }
});
