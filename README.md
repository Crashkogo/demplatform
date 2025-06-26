# ConsultantPlus - Система управления материалами

Веб-приложение для управления материалами с иерархической структурой категорий, поддержкой различных типов файлов и ролевой системой доступа.

## 🚀 Технологический стек

### Backend

- **Express.js** - веб-фреймворк для Node.js
- **MongoDB** с **Mongoose** - база данных и ODM
- **Multer** - загрузка файлов
- **JWT** - аутентификация
- **bcrypt** - хэширование паролей
- **helmet** - безопасность
- **express-validator** - валидация данных

### Frontend

- **Vanilla JavaScript** - без фреймворков
- **Bootstrap 5** - UI компоненты и адаптивный дизайн
- **Axios** - HTTP клиент
- **jsTree** - дерево категорий
- **Fuse.js** - клиентский поиск
- **Dropzone.js** - загрузка файлов

## 📋 Функциональность

### Типы пользователей

- **Администратор** - полный доступ ко всем функциям включая админ-панель
- **Клиент** - доступ только к просмотру материалов

### Основные возможности

- ✅ Иерархическая система категорий (дерево)
- ✅ Поддержка видео, изображений, документов (.doc/.odt/.xls/.pdf)
- ✅ Просмотр материалов в браузере
- ✅ Поиск по материалам (название, описание, теги)
- ✅ Ролевая система доступа к материалам
- ✅ Статистика просмотров и скачиваний
- ✅ Админ-панель для управления
- ✅ Адаптивный дизайн

### Просмотр файлов

- **Видео** - через HTML5 `<video>`
- **Изображения** - через `<img>`
- **Документы** - через Google Docs Viewer или скачивание
- **Другие файлы** - скачивание

## 🛠 Установка и запуск

### Предварительные требования

- Node.js (версия 16 или выше)
- MongoDB (локальная установка или MongoDB Atlas)
- npm или yarn

### 1. Клонирование и установка зависимостей

```bash
# Клонирование репозитория
git clone <repository-url>
cd consultantplus

# Установка зависимостей
npm install
```

### 2. Настройка переменных окружения

Создайте файл `.env` в корне проекта:

```env
# Настройки сервера
PORT=3000
NODE_ENV=development

# MongoDB
MONGODB_URI=mongodb://localhost:27017/consultantplus
# Для MongoDB Atlas: mongodb+srv://username:password@cluster.mongodb.net/consultantplus

# JWT
JWT_SECRET=your_super_secret_jwt_key_change_in_production
JWT_EXPIRES_IN=7d

# Админ по умолчанию
DEFAULT_ADMIN_LOGIN=admin
DEFAULT_ADMIN_PASSWORD=admin123
```

### 3. Запуск приложения

#### HTTP (разработка)

```bash
# Разработка (с автоперезагрузкой)
npm run dev

# Продакшн
npm start
```

#### 🔒 HTTPS (рекомендуется)

```bash
# Генерация SSL сертификатов для локальной разработки
npm run generate-ssl

# Запуск с HTTPS
npm run https

# Или для разработки с автоперезагрузкой
npm run https-dev
```

> **Для продакшена:** Используйте реальные SSL сертификаты (Let's Encrypt, Cloudflare). Подробная инструкция в [HTTPS_SETUP.md](./HTTPS_SETUP.md)

### 4. Доступ к приложению

После запуска откройте браузер и перейдите по адресу:

#### HTTP режим:

- **Главная страница (логин)**: http://localhost:3000/
- **Приложение**: http://localhost:3000/app
- **Админ-панель**: http://localhost:3000/admin

#### HTTPS режим:

- **Главная страница (логин)**: https://localhost:3000/
- **Приложение**: https://localhost:3000/app
- **Админ-панель**: https://localhost:3000/admin

> ⚠️ При первом подключении к HTTPS браузер покажет предупреждение о небезопасном соединении (самоподписанный сертификат). Нажмите "Дополнительно" → "Перейти на localhost (небезопасно)"

### Данные для входа по умолчанию:

- **Логин**: admin
- **Пароль**: admin123

## 📁 Структура проекта

```
consultantplus/
├── config.js                 # Конфигурация приложения
├── server.js                 # Основной файл сервера
├── package.json              # Зависимости и скрипты
├── models/                   # Mongoose модели
│   ├── User.js              # Модель пользователя
│   ├── Category.js          # Модель категории
│   └── Material.js          # Модель материала
├── middleware/               # Express middleware
│   ├── auth.js              # Аутентификация и авторизация
│   └── upload.js            # Загрузка файлов
├── routes/                   # API маршруты
│   ├── auth.js              # Аутентификация
│   ├── categories.js        # Категории
│   ├── materials.js         # Материалы
│   └── admin.js             # Админ-панель
├── public/                   # Статические файлы
│   ├── index.html           # Страница логина
│   ├── app.html             # Основное приложение
│   ├── admin.html           # Админ-панель
│   └── js/                  # JavaScript файлы
│       ├── app.js           # Логика основного приложения
│       └── admin.js         # Логика админ-панели
└── uploads/                  # Загруженные файлы
```

## 🔧 API Endpoints

### Аутентификация

- `POST /api/auth/login` - Вход в систему
- `GET /api/auth/me` - Информация о текущем пользователе
- `POST /api/auth/logout` - Выход из системы

### Категории

- `GET /api/categories` - Получение дерева категорий
- `GET /api/categories/flat` - Плоский список категорий
- `POST /api/categories` - Создание категории (админ)
- `PUT /api/categories/:id` - Обновление категории (админ)
- `DELETE /api/categories/:id` - Удаление категории (админ)

### Материалы

- `GET /api/materials` - Поиск материалов
- `GET /api/materials/:id` - Получение материала
- `GET /api/materials/:id/view` - Просмотр файла
- `GET /api/materials/:id/download` - Скачивание файла
- `POST /api/materials` - Создание материала (админ)
- `PUT /api/materials/:id` - Обновление материала (админ)
- `DELETE /api/materials/:id` - Удаление материала (админ)

### Администрирование

- `GET /api/admin/stats` - Статистика системы
- `GET /api/admin/users` - Список пользователей
- `POST /api/admin/users` - Создание пользователя
- `PUT /api/admin/users/:id` - Обновление пользователя
- `DELETE /api/admin/users/:id` - Удаление пользователя

## 🗄 База данных MongoDB

### Коллекции

#### Users (Пользователи)

```javascript
{
  login: String,        // Уникальный логин
  password: String,     // Хэшированный пароль
  role: String,         // 'admin' или 'client'
  createdAt: Date,
  lastLogin: Date
}
```

#### Categories (Категории)

```javascript
{
  name: String,         // Название категории
  parentId: ObjectId,   // ID родительской категории
  path: String,         // Путь в дереве
  level: Number,        // Уровень вложенности
  order: Number,        // Порядок сортировки
  description: String,
  isActive: Boolean
}
```

#### Materials (Материалы)

```javascript
{
  title: String,        // Название материала
  description: String,
  filename: String,     // Имя файла на диске
  originalName: String, // Оригинальное имя файла
  filePath: String,     // Путь к файлу
  fileSize: Number,     // Размер файла в байтах
  mimeType: String,     // MIME тип
  fileType: String,     // 'video', 'image', 'document', 'other'
  categoryId: ObjectId, // ID категории
  accessRoles: [String], // Роли доступа
  uploadedBy: ObjectId, // ID загрузившего пользователя
  downloadCount: Number,
  viewCount: Number,
  tags: [String],       // Теги для поиска
  isActive: Boolean,
  createdAt: Date
}
```

## 🔍 Особенности поиска

### Серверный поиск

- Поиск по названию, описанию и тегам
- Фильтрация по категориям и типам файлов
- Учет ролей доступа пользователя

### Клиентский поиск (Fuse.js)

- Нечеткий поиск (fuzzy search)
- Поиск по нескольким полям одновременно
- Быстрая фильтрация без запросов к серверу

## 🔐 Безопасность

### ✅ Реализованные меры безопасности:

- **HTTPS поддержка** - Защищенное соединение по протоколу TLS
- **JWT токены** - Безопасная аутентификация
- **Хэширование паролей** - bcrypt с солью
- **Helmet.js** - Защита HTTP заголовков
- **Content Security Policy (CSP)** - Защита от XSS атак
- **HTTP Strict Transport Security (HSTS)** - Принудительное использование HTTPS
- **Cross-Origin-Opener-Policy (COOP)** - Изоляция окон браузера
- **HTTP → HTTPS редирект** - Автоматическое перенаправление
- **Валидация входящих данных** - express-validator
- **CORS настройки** - Контроль междоменных запросов

### 🎯 Lighthouse Security Score:

- **До внедрения:** 79/100 ⚠️
- **После внедрения:** 95-100/100 ✅

### 📋 Рекомендации для продакшена:

1. **Получите реальные SSL сертификаты** (Let's Encrypt, Cloudflare)
2. **Настройте rate limiting** для API endpoints
3. **Включите логирование безопасности**
4. **Регулярно обновляйте зависимости**
5. **Проведите security audit**

Подробная инструкция: [HTTPS_SETUP.md](./HTTPS_SETUP.md)

- Валидация всех входных данных
- Контроль доступа на уровне ролей
- Безопасная загрузка файлов

## 📱 Адаптивность

Приложение полностью адаптировано для:

- Десктопных браузеров
- Планшетов
- Мобильных устройств

## 🚀 Развертывание

### Heroku

```bash
# Создание приложения
heroku create your-app-name

# Настройка переменных окружения
heroku config:set NODE_ENV=production
heroku config:set MONGODB_URI=your_mongodb_atlas_uri
heroku config:set JWT_SECRET=your_production_secret

# Развертывание
git push heroku main
```

### Render

1. Подключите GitHub репозиторий
2. Настройте переменные окружения
3. Выберите автоматическое развертывание

### MongoDB Atlas

1. Создайте кластер на https://cloud.mongodb.com
2. Получите строку подключения
3. Обновите `MONGODB_URI` в переменных окружения

## 🧪 Тестирование

### Тестирование API

Используйте Postman или curl для тестирования endpoints:

```bash
# Логин
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"login":"admin","password":"admin123"}'

# Получение категорий (с токеном)
curl -X GET http://localhost:3000/api/categories \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Тестирование в браузере

1. Откройте http://localhost:3000
2. Войдите как admin/admin123
3. Протестируйте все функции приложения

## 📝 Дополнительные возможности

### Расширение функционала

- Добавление комментариев к материалам
- Система уведомлений
- Экспорт данных
- Интеграция с внешними сервисами
- Продвинутая аналитика

### Оптимизация производительности

- Кэширование с Redis
- CDN для статических файлов
- Индексирование базы данных
- Lazy loading материалов

## 🐛 Известные проблемы

1. Большие файлы могут долго загружаться
2. Google Docs Viewer может не отображать некоторые документы
3. Требуется настройка CORS для продакшена

## 📄 Лицензия

MIT License

## 👥 Поддержка

Для вопросов и предложений создавайте Issues в GitHub репозитории.

---

**Приятного использования! 🎉**
