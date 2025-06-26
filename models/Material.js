const mongoose = require('mongoose');
const path = require('path');

const materialSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200
    },
    description: {
        type: String,
        maxlength: 1000
    },
    filename: {
        type: String,
        required: true
    },
    originalName: {
        type: String,
        required: true
    },
    filePath: {
        type: String,
        required: true
    },
    fileSize: {
        type: Number,
        required: true
    },
    mimeType: {
        type: String,
        required: true
    },
    fileType: {
        type: String,
        required: true,
        enum: ['video', 'image', 'document', 'other']
    },
    categoryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
        required: true
    },
    accessRoles: [{
        type: String,
        enum: ['admin', 'client'],
        default: ['client']
    }],
    uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    downloadCount: {
        type: Number,
        default: 0
    },
    viewCount: {
        type: Number,
        default: 0
    },
    isActive: {
        type: Boolean,
        default: true
    },
    tags: [{
        type: String,
        trim: true
    }]
}, {
    timestamps: true
});

// Индексы для оптимизации поиска
materialSchema.index({ categoryId: 1, isActive: 1 });
materialSchema.index({ title: 'text', description: 'text', tags: 'text' });
materialSchema.index({ fileType: 1 });
materialSchema.index({ accessRoles: 1 });

// Виртуальное поле для определения типа файла на основе MIME-типа
materialSchema.virtual('displayType').get(function () {
    const mimeType = this.mimeType;

    if (mimeType.startsWith('video/')) {
        return 'video';
    } else if (mimeType.startsWith('image/')) {
        return 'image';
    } else if (
        mimeType.includes('document') ||
        mimeType.includes('pdf') ||
        mimeType.includes('word') ||
        mimeType.includes('excel') ||
        mimeType.includes('spreadsheet') ||
        mimeType.includes('presentation') ||
        mimeType.includes('odt') ||
        mimeType.includes('ods') ||
        mimeType.includes('odp')
    ) {
        return 'document';
    } else {
        return 'other';
    }
});

// Middleware для определения типа файла перед сохранением
materialSchema.pre('save', function (next) {
    if (this.isNew || this.isModified('mimeType')) {
        this.fileType = this.displayType;
    }
    next();
});

// Статический метод для поиска материалов
materialSchema.statics.search = async function (query, options = {}) {
    const {
        categoryId,
        fileType,
        limit = 50,
        skip = 0
    } = options;

    const searchQuery = {
        isActive: true
    };

    if (categoryId) {
        searchQuery.categoryId = categoryId;
    }

    if (fileType) {
        searchQuery.fileType = fileType;
    }

    if (query) {
        searchQuery.$or = [
            { title: new RegExp(query, 'i') },
            { description: new RegExp(query, 'i') },
            { tags: new RegExp(query, 'i') }
        ];
    }

    const materials = await this.find(searchQuery)
        .populate('categoryId', 'name path')
        .populate('uploadedBy', 'login')
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip)
        .lean();

    const total = await this.countDocuments(searchQuery);

    return {
        materials,
        total,
        hasMore: total > skip + materials.length
    };
};

// Метод для увеличения счетчика просмотров
materialSchema.methods.incrementView = async function () {
    this.viewCount += 1;
    return this.save();
};

// Метод для увеличения счетчика скачиваний
materialSchema.methods.incrementDownload = async function () {
    this.downloadCount += 1;
    return this.save();
};

module.exports = mongoose.model('Material', materialSchema); 