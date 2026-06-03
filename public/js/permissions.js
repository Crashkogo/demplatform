/**
 * @description Manages user permissions for the admin panel.
 * This is a simple object-based implementation for stability.
 */
const PermissionsManager = {
    userPermissions: {},
    userInfo: null,
    isInitialized: false,
    // Права по категориям: { canViewMaterials: [1,2,3] | 'all', ... }
    categoryPermissions: {},

    /**
     * @private
     * Processes a user object to populate the manager's state.
     * @param {object | null} user - The user object from the API.
     */
    _processUserData(user) {
        if (!user) {
            this.userInfo = null;
            this.userPermissions = {};
            this.isInitialized = false; // Сбрасываем, если пользователь невалиден
            console.warn('PermissionsManager: Processed a null user object.');
            return;
        }

        this.userInfo = user;
        this.userPermissions = user.Role || {};
        this.userPermissions.isAdmin = user.Role?.isAdmin || false;

        // Сохраняем название роли в userInfo для отображения в UI
        this.userInfo.roleName = user.Role?.name || 'Не назначена';

        // Сохраняем allowedCategories если они есть
        if (user.Role?.allowedCategories) {
            this.userPermissions.allowedCategories = user.Role.allowedCategories;
        }

        // Сохраняем categoryAccessType
        if (user.Role?.canManageAllCategories || user.Role?.isAdmin) {
            this.userPermissions.categoryAccessType = 'all';
        } else if (user.Role?.allowedCategories && user.Role.allowedCategories.length > 0) {
            this.userPermissions.categoryAccessType = 'specific';
        } else {
            this.userPermissions.categoryAccessType = 'none';
        }

        console.log('PermissionsManager: User processed:', {
            login: user.login,
            roleName: this.userInfo.roleName,
            isAdmin: this.userPermissions.isAdmin,
            categoryAccessType: this.userPermissions.categoryAccessType
        });

        localStorage.setItem('user', JSON.stringify(this.userInfo));
        this.isInitialized = true;
    },

    /**
     * Initializes permissions by fetching from the '/api/auth/me' endpoint.
     * Skips fetching if permissions are already set (e.g., right after login).
     * @returns {Promise<boolean>}
     */
    async initialize() {
        if (this.isInitialized) {
            console.log('PermissionsManager: Already initialized, skipping fetch.');
            return true;
        }

        try {
            const response = await axios.get('/api/auth/me');
            if (response.data.success && response.data.user) {
                this._processUserData(response.data.user);
                if (response.data.categoryPermissions) {
                    this.categoryPermissions = response.data.categoryPermissions;
                }
                console.log('PermissionsManager: Initialized from /api/auth/me.');
                return true;
            }
            this._processUserData(null);
            return false;
        } catch (error) {
            this._processUserData(null);
            console.error('PermissionsManager: Failed to fetch user permissions.', error);
            return false;
        }
    },

    /**
     * Manually sets permissions from a user object, used by the login page.
     * @param {object} user - The user object received from the login API.
     */
    setPermissions(user, catPerms) {
        this._processUserData(user);
        if (catPerms) this.categoryPermissions = catPerms;
        console.log('PermissionsManager: Permissions set manually from login page.');
    },

    /**
     * Проверяет, есть ли у пользователя право на конкретное действие в конкретной категории.
     * Учитывает что право и доступ к категории должны быть у одной роли.
     * @param {string} permission - Ключ права (e.g. 'canDownloadMaterials')
     * @param {number|string} categoryId - ID категории материала
     * @returns {boolean}
     */
    canDoInCategory(permission, categoryId) {
        if (!this.isInitialized) return false;
        if (this.userPermissions.isAdmin) return true;
        const catPerm = this.categoryPermissions[permission];
        if (!catPerm) return false;
        if (catPerm === 'all') return true;
        return catPerm.includes(Number(categoryId));
    },

    /**
     * Checks if the user has a specific permission.
     * @param {string} key - The permission key (e.g., 'canCreateUsers').
     * @returns {boolean}
     */
    has(key) {
        if (this.userPermissions.isAdmin) {
            return true;
        }
        return this.userPermissions[key] || false;
    },

    /**
     * Checks if the user can view a specific section of the admin panel.
     * @param {string} sectionName - The name of the section.
     * @returns {boolean}
     */
    canViewSection(sectionName) {
        if (!this.isInitialized) return false; // Защита от проверки до инициализации

        if (this.userPermissions.isAdmin) {
            return true;
        }

        switch (sectionName) {
            case 'dashboard':
                return this.has('isAdmin');
            case 'users':
                return this.has('canViewUsers') || this.has('canCreateUsers') || this.has('canEditUsers') || this.has('canDeleteUsers');
            case 'roles':
                return this.has('canManageRoles');
            case 'categories':
                return this.has('canCreateCategories') || this.has('canEditCategories') || this.has('canDeleteCategories') || this.has('canManageAllCategories') || (this.userPermissions.categoryAccessType && this.userPermissions.allowedCategories?.length > 0);
            case 'materials':
                return this.has('canViewMaterials') || this.has('canCreateMaterials') || this.has('canEditMaterials') || this.has('canDeleteMaterials');
            case 'upload':
                return this.has('canCreateMaterials');
            case 'history-section':
                return this.has('canViewLogs');
            case 'articles':
            case 'articles-section':
                return this.has('canReadArticles') || this.has('canCreateArticles');
            case 'pro-review':
                return this.has('canGenerateProReview');
            default:
                return false;
        }
    },

    /**
     * Checks if the user has access to a specific category.
     * @param {number|string} categoryId - The ID of the category.
     * @returns {boolean}
     */
    hasCategoryAccess(categoryId) {
        if (!this.isInitialized) return false;
        if (this.userPermissions.isAdmin || this.has('canManageAllCategories')) {
            return true;
        }
        if (this.userPermissions.categoryAccessType === 'all') {
            return true;
        }
        if (this.userPermissions.categoryAccessType === 'specific' && Array.isArray(this.userPermissions.allowedCategories)) {
            return this.userPermissions.allowedCategories.some(cat => cat.id == categoryId);
        }
        return false;
    },

    /**
     * Clears all stored permission data.
     */
    clear() {
        this.userPermissions = {};
        this.userInfo = null;
        this.isInitialized = false;
        this.categoryPermissions = {};
    },

    /**
     * Returns the raw permissions object (the Role object).
     * @returns {object}
     */
    getPermissions() {
        return this.userPermissions;
    },

    /**
     * Returns the full user info object.
     * @returns {object}
     */
    getUser() {
        return this.userInfo;
    },

    /**
     * Convenience method to check for admin status.
     * @returns {boolean}
     */
    isAdmin() {
        return this.isInitialized && (this.userPermissions.isAdmin || false);
    }
};