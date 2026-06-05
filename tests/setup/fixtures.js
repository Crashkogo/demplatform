// tests/setup/fixtures.js
const { User, Role } = require('../../models');

async function createAdminRole() {
    return Role.create({
        name: 'Тест-Админ',
        isAdmin: true,
        canViewMaterials: true,
        canDownloadMaterials: true,
        canCreateMaterials: true,
        canEditMaterials: true,
        canDeleteMaterials: true,
        canCreateCategories: true,
        canEditCategories: true,
        canDeleteCategories: true,
        canManageAllCategories: true,
        categoryAccessType: 'all',
        canViewUsers: true,
        canCreateUsers: true,
        canEditUsers: true,
        canDeleteUsers: true,
        canViewLogs: true,
        canManageRoles: true
    });
}

async function createRegularRole() {
    return Role.create({
        name: 'Тест-Пользователь',
        isAdmin: false,
        canViewMaterials: true,
        canDownloadMaterials: false,
        canManageRoles: false,
        categoryAccessType: 'selected'
    });
}

async function createAdminUser(adminRole) {
    // Пароль передаётся в открытом виде — beforeSave хук в User.js
    // автоматически хеширует его через bcrypt при создании/сохранении.
    const user = await User.create({
        login: 'test_admin',
        password: 'admin_password_test',
        tokenVersion: 0
    });
    await user.setRoles([adminRole.id]);
    return User.findByPk(user.id, {
        include: [{ model: Role, as: 'roles', through: { attributes: [] } }]
    });
}

async function createRegularUser(regularRole) {
    // Пароль передаётся в открытом виде — beforeSave хук в User.js
    // автоматически хеширует его через bcrypt при создании/сохранении.
    const user = await User.create({
        login: 'test_user',
        password: 'user_password_test',
        tokenVersion: 0
    });
    await user.setRoles([regularRole.id]);
    return User.findByPk(user.id, {
        include: [{ model: Role, as: 'roles', through: { attributes: [] } }]
    });
}

async function createFixtures() {
    const adminRole = await createAdminRole();
    const regularRole = await createRegularRole();
    const adminUser = await createAdminUser(adminRole);
    const regularUser = await createRegularUser(regularRole);
    return { adminRole, regularRole, adminUser, regularUser };
}

module.exports = { createFixtures };
