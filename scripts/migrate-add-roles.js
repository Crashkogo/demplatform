// scripts/migrate-add-roles.js
require('dotenv').config();
const { sequelize, Role, User } = require('../models');

async function migrateRoles() {
    console.log('🚀 Начало миграции системы ролей...\n');

    try {
        // Создаем транзакцию для безопасности
        const transaction = await sequelize.transaction();

        try {
            // === ШАГ 1: Создаем таблицу roles ===
            console.log('📋 Шаг 1: Создание таблицы roles...');
            
            await sequelize.query(`
                CREATE TABLE IF NOT EXISTS roles (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(100) NOT NULL UNIQUE,
                    description TEXT,
                    is_admin BOOLEAN DEFAULT FALSE,
                    
                    -- Права на материалы
                    can_view_materials BOOLEAN DEFAULT TRUE,
                    can_download_materials BOOLEAN DEFAULT FALSE,
                    can_create_materials BOOLEAN DEFAULT FALSE,
                    can_edit_materials BOOLEAN DEFAULT FALSE,
                    can_delete_materials BOOLEAN DEFAULT FALSE,
                    
                    -- Права на категории
                    can_create_categories BOOLEAN DEFAULT FALSE,
                    can_edit_categories BOOLEAN DEFAULT FALSE,
                    can_delete_categories BOOLEAN DEFAULT FALSE,
                    can_manage_all_categories BOOLEAN DEFAULT FALSE,
                    category_access_type VARCHAR(20) DEFAULT 'selected',
                    
                    -- Права на пользователей
                    can_view_users BOOLEAN DEFAULT FALSE,
                    can_create_users BOOLEAN DEFAULT FALSE,
                    can_edit_users BOOLEAN DEFAULT FALSE,
                    can_delete_users BOOLEAN DEFAULT FALSE,
                    
                    -- Права на логи
                    can_view_logs BOOLEAN DEFAULT FALSE,
                    
                    -- Права на роли
                    can_manage_roles BOOLEAN DEFAULT FALSE,
                    
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `, { transaction });
            
            console.log('✅ Таблица roles создана\n');

            // === ШАГ 2: Создаем таблицу role_categories ===
            console.log('📋 Шаг 2: Создание таблицы role_categories...');
            
            await sequelize.query(`
                CREATE TABLE IF NOT EXISTS role_categories (
                    id SERIAL PRIMARY KEY,
                    role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
                    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(role_id, category_id)
                );
            `, { transaction });
            
            console.log('✅ Таблица role_categories создана\n');

            // === ШАГ 3: Добавляем поле role_id в таблицу users ===
            console.log('📋 Шаг 3: Добавление поля role_id в таблицу users...');
            
            try {
                await sequelize.query(`
                    ALTER TABLE users 
                    ADD COLUMN IF NOT EXISTS role_id INTEGER REFERENCES roles(id) ON DELETE SET NULL;
                `, { transaction });
                
                console.log('✅ Поле role_id добавлено в таблицу users\n');
            } catch (error) {
                if (error.message.includes('already exists')) {
                    console.log('ℹ️  Поле role_id уже существует\n');
                } else {
                    throw error;
                }
            }

            // === ШАГ 4: Создаем роли по умолчанию ===
            console.log('📋 Шаг 4: Создание ролей по умолчанию...');
            
            const defaultRoles = [
                {
                    name: 'Администратор',
                    description: 'Полный доступ ко всем функциям системы',
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
                },
                {
                    name: 'Клиент (только просмотр)',
                    description: 'Может просматривать материалы в доступных категориях',
                    isAdmin: false,
                    canViewMaterials: true,
                    canDownloadMaterials: false,
                    canCreateMaterials: false,
                    canEditMaterials: false,
                    canDeleteMaterials: false,
                    canCreateCategories: false,
                    canEditCategories: false,
                    canDeleteCategories: false,
                    canManageAllCategories: false,
                    categoryAccessType: 'selected',
                    canViewUsers: false,
                    canCreateUsers: false,
                    canEditUsers: false,
                    canDeleteUsers: false,
                    canViewLogs: false,
                    canManageRoles: false
                },
                {
                    name: 'Клиент (просмотр и скачивание)',
                    description: 'Может просматривать и скачивать материалы',
                    isAdmin: false,
                    canViewMaterials: true,
                    canDownloadMaterials: true,
                    canCreateMaterials: false,
                    canEditMaterials: false,
                    canDeleteMaterials: false,
                    canCreateCategories: false,
                    canEditCategories: false,
                    canDeleteCategories: false,
                    canManageAllCategories: false,
                    categoryAccessType: 'selected',
                    canViewUsers: false,
                    canCreateUsers: false,
                    canEditUsers: false,
                    canDeleteUsers: false,
                    canViewLogs: false,
                    canManageRoles: false
                },
                {
                    name: 'Редактор',
                    description: 'Может создавать и редактировать материалы',
                    isAdmin: false,
                    canViewMaterials: true,
                    canDownloadMaterials: true,
                    canCreateMaterials: true,
                    canEditMaterials: true,
                    canDeleteMaterials: false,
                    canCreateCategories: false,
                    canEditCategories: false,
                    canDeleteCategories: false,
                    canManageAllCategories: false,
                    categoryAccessType: 'selected',
                    canViewUsers: false,
                    canCreateUsers: false,
                    canEditUsers: false,
                    canDeleteUsers: false,
                    canViewLogs: false,
                    canManageRoles: false
                },
                {
                    name: 'Менеджер контента',
                    description: 'Полное управление материалами и категориями',
                    isAdmin: false,
                    canViewMaterials: true,
                    canDownloadMaterials: true,
                    canCreateMaterials: true,
                    canEditMaterials: true,
                    canDeleteMaterials: true,
                    canCreateCategories: true,
                    canEditCategories: true,
                    canDeleteCategories: true,
                    canManageAllCategories: false,
                    categoryAccessType: 'selected',
                    canViewUsers: false,
                    canCreateUsers: false,
                    canEditUsers: false,
                    canDeleteUsers: false,
                    canViewLogs: false,
                    canManageRoles: false
                },
                {
                    name: 'HR менеджер',
                    description: 'Управление пользователями без доступа к материалам',
                    isAdmin: false,
                    canViewMaterials: false,
                    canDownloadMaterials: false,
                    canCreateMaterials: false,
                    canEditMaterials: false,
                    canDeleteMaterials: false,
                    canCreateCategories: false,
                    canEditCategories: false,
                    canDeleteCategories: false,
                    canManageAllCategories: false,
                    categoryAccessType: 'selected',
                    canViewUsers: true,
                    canCreateUsers: true,
                    canEditUsers: true,
                    canDeleteUsers: false, // Без права удаления
                    canViewLogs: false,
                    canManageRoles: false
                }
            ];

            for (const roleData of defaultRoles) {
                const [role, created] = await Role.findOrCreate({
                    where: { name: roleData.name },
                    defaults: roleData,
                    transaction
                });
                
                if (created) {
                    console.log(`   ✅ Создана роль: ${role.name}`);
                } else {
                    console.log(`   ℹ️  Роль уже существует: ${role.name}`);
                }
            }
            
            console.log('');

            // === ШАГ 5: Мигрируем существующих пользователей ===
            console.log('📋 Шаг 5: Миграция существующих пользователей...');
            
            // Находим роли
            const adminRole = await Role.findOne({ 
                where: { name: 'Администратор' },
                transaction 
            });
            
            const clientRole = await Role.findOne({ 
                where: { name: 'Клиент (просмотр и скачивание)' },
                transaction 
            });

            // Мигрируем администраторов
            const adminUsers = await User.findAll({ 
                where: { role: 'admin', roleId: null },
                transaction 
            });
            
            for (const user of adminUsers) {
                await user.update({ roleId: adminRole.id }, { transaction });
                console.log(`   ✅ Пользователь ${user.login} назначен на роль "Администратор"`);
            }

            // Мигрируем клиентов
            const clientUsers = await User.findAll({ 
                where: { role: 'client', roleId: null },
                transaction 
            });
            
            for (const user of clientUsers) {
                await user.update({ roleId: clientRole.id }, { transaction });
                console.log(`   ✅ Пользователь ${user.login} назначен на роль "Клиент (просмотр и скачивание)"`);
            }
            
            console.log('');

            // === ШАГ 6: Создаем индексы ===
            console.log('📋 Шаг 6: Создание индексов...');
            
            await sequelize.query(`
                CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id);
                CREATE INDEX IF NOT EXISTS idx_role_categories_role_id ON role_categories(role_id);
                CREATE INDEX IF NOT EXISTS idx_role_categories_category_id ON role_categories(category_id);
                CREATE INDEX IF NOT EXISTS idx_roles_is_admin ON roles(is_admin);
            `, { transaction });
            
            console.log('✅ Индексы созданы\n');

            // Коммитим транзакцию
            await transaction.commit();

            console.log('✨ Миграция успешно завершена!\n');
            console.log('📊 Статистика:');
            console.log(`   • Ролей создано: ${defaultRoles.length}`);
            console.log(`   • Пользователей мигрировано: ${adminUsers.length + clientUsers.length}`);
            console.log('');
            console.log('⚠️  ВАЖНО:');
            console.log('   • Старое поле "role" сохранено для обратной совместимости');
            console.log('   • Теперь все новые пользователи должны использовать roleId');
            console.log('   • Вы можете удалить поле "role" позже командой:');
            console.log('     ALTER TABLE users DROP COLUMN role;\n');

        } catch (error) {
            // Откатываем транзакцию при ошибке
            await transaction.rollback();
            throw error;
        }

    } catch (error) {
        console.error('❌ Ошибка миграции:', error);
        console.error('Детали:', error.message);
        process.exit(1);
    } finally {
        await sequelize.close();
    }
}

// Запускаем миграцию
migrateRoles()
    .then(() => {
        console.log('👋 Миграция завершена. Перезапустите сервер.');
        process.exit(0);
    })
    .catch((error) => {
        console.error('💥 Критическая ошибка:', error);
        process.exit(1);
    });