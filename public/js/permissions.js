// Модуль управления правами пользователя
const PermissionsManager = {
    permissions: null,
    accessibleCategoryIds: [],

    // Инициализация из localStorage
    init() {
        const storedPermissions = localStorage.getItem('permissions');
        const storedCategoryIds = localStorage.getItem('accessibleCategoryIds');

        if (storedPermissions) {
            this.permissions = JSON.parse(storedPermissions);
        }

        if (storedCategoryIds) {
            this.accessibleCategoryIds = JSON.parse(storedCategoryIds);
        }
    },

    // Сохранение прав при логине
    setPermissions(permissions, accessibleCategoryIds) {
        this.permissions = permissions;
        this.accessibleCategoryIds = accessibleCategoryIds || [];

        localStorage.setItem('permissions', JSON.stringify(permissions));
        localStorage.setItem('accessibleCategoryIds', JSON.stringify(this.accessibleCategoryIds));
    },

    // Очистка прав при выходе
    clear() {
        this.permissions = null;
        this.accessibleCategoryIds = [];
        localStorage.removeItem('permissions');
        localStorage.removeItem('accessibleCategoryIds');
    },

    // Проверка конкретного права
    has(permission) {
        if (!this.permissions) return false;
        return this.permissions[permission] === true;
    },

    // Проверка прав администратора
    isAdmin() {
        if (!this.permissions) return false;
        return this.permissions.isAdmin === true;
    },

    // Проверка доступа к категории
    hasCategoryAccess(categoryId) {
        if (this.isAdmin()) return true;
        if (this.permissions && this.permissions.canManageAllCategories) return true;
        return this.accessibleCategoryIds.includes(categoryId);
    },

    // Получить все доступные категории
    getAccessibleCategoryIds() {
        if (this.isAdmin() || (this.permissions && this.permissions.canManageAllCategories)) {
            return 'all';
        }
        return this.accessibleCategoryIds;
    },

    // Проверка - может ли просматривать раздел
    canViewSection(section) {
        if (this.isAdmin()) return true;

        switch (section) {
            case 'users':
                return this.has('canViewUsers');
            case 'roles':
                return this.has('canManageRoles');
            case 'categories':
                return this.has('canCreateCategories') || this.has('canEditCategories') || this.has('canDeleteCategories');
            case 'materials':
                return this.has('canViewMaterials') || this.has('canCreateMaterials') || this.has('canEditMaterials');
            case 'upload':
                return this.has('canCreateMaterials');
            default:
                return false;
        }
    },

    // Получить все права
    getAll() {
        return this.permissions || {};
    }
};

// Инициализируем при загрузке
if (typeof window !== 'undefined') {
    PermissionsManager.init();
}

