const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100
    },
    parentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
        default: null
    },
    path: {
        type: String
    },
    level: {
        type: Number,
        required: true,
        default: 0
    },
    order: {
        type: Number,
        default: 0
    },
    description: {
        type: String,
        maxlength: 500
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// Индексы для оптимизации запросов
categorySchema.index({ parentId: 1, order: 1 });
categorySchema.index({ path: 1 });
categorySchema.index({ name: 'text', description: 'text' });

// Middleware для автоматического создания пути и уровня
categorySchema.pre('save', async function (next) {
    if (this.isNew) {
        // Для новых категорий устанавливаем уровень
        if (this.parentId) {
            const parent = await mongoose.model('Category').findById(this.parentId);
            if (parent) {
                this.level = parent.level + 1;
            } else {
                this.level = 0;
            }
        } else {
            this.level = 0;
        }
    } else if (this.isModified('parentId')) {
        // Для существующих категорий при изменении родителя
        if (this.parentId) {
            const parent = await mongoose.model('Category').findById(this.parentId);
            if (parent) {
                this.path = `${parent.path}/${this._id}`;
                this.level = parent.level + 1;
            } else {
                this.path = `/${this._id}`;
                this.level = 0;
            }
        } else {
            this.path = `/${this._id}`;
            this.level = 0;
        }
    }
    next();
});

// Middleware для обновления пути после сохранения новой категории
categorySchema.post('save', async function (doc) {
    if (this.isNew || !doc.path) {
        // Устанавливаем путь после получения _id
        let newPath;
        if (doc.parentId) {
            const parent = await mongoose.model('Category').findById(doc.parentId);
            if (parent) {
                newPath = `${parent.path}/${doc._id}`;
            } else {
                newPath = `/${doc._id}`;
            }
        } else {
            newPath = `/${doc._id}`;
        }

        // Обновляем путь в базе данных
        await mongoose.model('Category').updateOne(
            { _id: doc._id },
            { path: newPath }
        );

        // Обновляем текущий документ
        doc.path = newPath;
    }
});

// Статический метод для получения дерева категорий
categorySchema.statics.getTree = async function () {
    const categories = await this.find({ isActive: true })
        .sort({ level: 1, order: 1, name: 1 })
        .lean();

    const categoryMap = {};
    const tree = [];

    // Создаем карту всех категорий (используем строковые ID)
    categories.forEach(cat => {
        const catId = cat._id.toString();
        categoryMap[catId] = { ...cat, children: [] };
    });

    // Строим дерево
    categories.forEach(cat => {
        const catId = cat._id.toString();
        const parentId = cat.parentId ? cat.parentId.toString() : null;

        if (parentId && categoryMap[parentId]) {
            categoryMap[parentId].children.push(categoryMap[catId]);
        } else {
            tree.push(categoryMap[catId]);
        }
    });

    return tree;
};

// Статический метод для получения всех потомков категории
categorySchema.statics.getDescendants = async function (categoryId) {
    const category = await this.findById(categoryId);
    if (!category) return [];

    const descendants = await this.find({
        path: new RegExp(`^${category.path}/`)
    }).lean();

    return descendants;
};

module.exports = mongoose.model('Category', categorySchema); 