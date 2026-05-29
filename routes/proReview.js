'use strict';

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs/promises');
const { Op } = require('sequelize');
const {
    Document, Paragraph, TextRun, Header, Footer, ImageRun,
    AlignmentType, BorderStyle, ShadingType, Packer,
    Table, TableRow, TableCell, WidthType,
} = require('docx');

const { Article, ArticleSection, HeaderImage, User } = require('../models');
const { authenticateToken } = require('../middleware/auth');
const convertService = require('../services/convertService');
const { htmlToDocxParagraphs } = require('../utils/htmlToDocx');
const { writeLimiter } = require('../middleware/rateLimiter');
const logger = require('../utils/logger');

const mm = (val) => Math.round(val * 56.69);

const canGenerate = (req, res, next) => {
    const role = req.user.roleData;
    if (!role) return res.status(403).json({ success: false, message: 'Нет доступа' });
    if (role.isAdmin || role.canGenerateProReview) return next();
    return res.status(403).json({ success: false, message: 'Нет права формирования про-обзора' });
};

const noTableBorder = {
    top: { style: BorderStyle.NONE, size: 0, color: 'auto' },
    bottom: { style: BorderStyle.NONE, size: 0, color: 'auto' },
    left: { style: BorderStyle.NONE, size: 0, color: 'auto' },
    right: { style: BorderStyle.NONE, size: 0, color: 'auto' },
    insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'auto' },
    insideVertical: { style: BorderStyle.NONE, size: 0, color: 'auto' },
};

// Таблица колонтитула: НОВОСТИ ЗАКОНОДАТЕЛЬСТВА слева, дата справа, рамка + серый фон
function makeIssueTable(dateStr) {
    const outerV = { style: BorderStyle.SINGLE, size: 12, color: '000000' };
    const noB = { style: BorderStyle.NONE, size: 0, color: 'auto' };
    const shading = { type: ShadingType.SOLID, color: 'CCCCCC', fill: 'CCCCCC' };
    return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: noTableBorder,
        rows: [
            new TableRow({
                children: [
                    new TableCell({
                        borders: { top: outerV, bottom: outerV, left: outerV, right: noB },
                        shading,
                        margins: { top: 60, bottom: 60, left: 120, right: 60 },
                        children: [new Paragraph({
                            children: [new TextRun({ text: 'НОВОСТИ ЗАКОНОДАТЕЛЬСТВА', bold: true, size: 18 })],
                            alignment: AlignmentType.LEFT,
                        })],
                        width: { size: 65, type: WidthType.PERCENTAGE },
                    }),
                    new TableCell({
                        borders: { top: outerV, bottom: outerV, left: noB, right: outerV },
                        shading,
                        margins: { top: 60, bottom: 60, left: 60, right: 120 },
                        children: [new Paragraph({
                            children: [new TextRun({ text: dateStr, bold: true, size: 18 })],
                            alignment: AlignmentType.RIGHT,
                        })],
                        width: { size: 35, type: WidthType.PERCENTAGE },
                    }),
                ],
            }),
        ],
    });
}

// Футер: таблица с рамкой со всех сторон + серый фон
function makeFooter() {
    const allSides = {
        top: { style: BorderStyle.SINGLE, size: 12, color: '000000' },
        bottom: { style: BorderStyle.SINGLE, size: 12, color: '000000' },
        left: { style: BorderStyle.SINGLE, size: 12, color: '000000' },
        right: { style: BorderStyle.SINGLE, size: 12, color: '000000' },
    };
    const shading = { type: ShadingType.SOLID, color: 'CCCCCC', fill: 'CCCCCC' };
    return new Footer({
        children: [
            new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                borders: noTableBorder,
                rows: [
                    new TableRow({
                        children: [
                            new TableCell({
                                borders: allSides,
                                shading,
                                margins: { top: 60, bottom: 60, left: 60, right: 60 },
                                children: [new Paragraph({
                                    children: [new TextRun({
                                        text: 'ООО «Инженеры информации»    тел (8443) 300-800, (8442) 300-800        e-mail: mail@enginf.ru',
                                        size: 16,
                                    })],
                                    alignment: AlignmentType.CENTER,
                                })],
                            }),
                        ],
                    }),
                ],
            }),
        ],
    });
}

// Все статьи раздела в одной таблице.
// Рамки задаём на уровне TABLE (outer + insideHorizontal) — ячейки без explicit borders,
// чтобы не перекрывать table-level границы. Это даёт единую таблицу с разделителями.
function makeSectionArticlesTable(articles) {
    const side = { style: BorderStyle.SINGLE, size: 8, color: '000000' };
    const noB = { style: BorderStyle.NONE, size: 0, color: 'auto' };

    const rows = articles.map((article) => {
        const titlePara = new Paragraph({
            children: [new TextRun({ text: article.title, size: 18, bold: true })],
            alignment: AlignmentType.CENTER,
            shading: { type: ShadingType.SOLID, color: 'D9D9D9', fill: 'D9D9D9' },
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000' } },
            spacing: { before: 40, after: 40 },
        });
        const contentParas = htmlToDocxParagraphs(article.content, { size: 18 });
        return new TableRow({
            children: [
                new TableCell({
                    margins: { top: 60, bottom: 60, left: 80, right: 80 },
                    children: [titlePara, ...contentParas],
                }),
            ],
        });
    });

    return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
            top: side,
            bottom: side,
            left: side,
            right: side,
            insideHorizontal: side,
            insideVertical: noB,
        },
        rows,
    });
}

router.get('/pro-review/generate', authenticateToken, canGenerate, writeLimiter, async (req, res) => {
    try {
        const { dateFrom, dateTo, format } = req.query;
        if (!dateFrom || !dateTo) {
            return res.status(400).json({ success: false, message: 'dateFrom, dateTo обязательны' });
        }

        const dateFromObj = new Date(dateFrom);
        const dateToObj = new Date(dateTo);

        if (isNaN(dateFromObj.getTime()) || isNaN(dateToObj.getTime())) {
            return res.status(400).json({ success: false, message: 'Некорректный формат даты' });
        }

        dateToObj.setHours(23, 59, 59, 999);

        const fmtDate = (d) => d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
        const issueDateStr = `${fmtDate(dateFromObj)} – ${fmtDate(dateToObj)}`;

        // Шапочное изображение
        let headerImageBuffer = null;
        let imageType = 'png';
        const headerImg = await HeaderImage.findOne({ order: [['createdAt', 'DESC']] });
        if (headerImg) {
            const imgPath = path.resolve(headerImg.path);
            try {
                await fs.access(imgPath);
                headerImageBuffer = await fs.readFile(imgPath);
                const ext = path.extname(headerImg.filename).toLowerCase().replace('.', '');
                imageType = (ext === 'jpg' || ext === 'jpeg') ? 'jpg' : 'png';
            } catch {
                // файл не найден — генерируем документ без шапки
            }
        }

        // Статьи
        const articles = await Article.findAll({
            where: { publishedAt: { [Op.between]: [dateFromObj, dateToObj] } },
            include: [
                { model: ArticleSection, as: 'sections', through: { attributes: [] } },
                { model: User, as: 'author', attributes: ['id', 'login'] },
            ],
            order: [['publishedAt', 'ASC']],
        });

        const allSections = await ArticleSection.findAll({
            order: [['sortOrder', 'ASC'], ['name', 'ASC']],
        });

        const sectionArticles = new Map();
        for (const s of allSections) sectionArticles.set(s.id, []);
        const noSectionArticles = [];
        for (const article of articles) {
            if (article.sections && article.sections.length > 0) {
                const sorted = article.sections.slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
                const firstId = sorted[0].id;
                if (sectionArticles.has(firstId)) {
                    sectionArticles.get(firstId).push(article);
                } else {
                    noSectionArticles.push(article);
                }
            } else {
                noSectionArticles.push(article);
            }
        }

        // Тело документа
        const bodyChildren = [];

        for (const section of allSections) {
            const arts = sectionArticles.get(section.id) || [];
            if (arts.length === 0) continue;

            bodyChildren.push(new Paragraph({
                children: [new TextRun({
                    text: section.name.toUpperCase(),
                    bold: true,
                    size: 28,
                    font: 'Comic Sans MS',
                })],
                alignment: AlignmentType.CENTER,
                shading: { type: ShadingType.SOLID, color: 'CCCCCC', fill: 'CCCCCC' },
                spacing: { before: 0, after: 0 },
                border: {
                    top: { style: BorderStyle.SINGLE, size: 8, color: '000000' },
                    bottom: { style: BorderStyle.SINGLE, size: 8, color: '000000' },
                    left: { style: BorderStyle.SINGLE, size: 8, color: '000000' },
                    right: { style: BorderStyle.SINGLE, size: 8, color: '000000' },
                },
            }));
            bodyChildren.push(makeSectionArticlesTable(arts));
            bodyChildren.push(new Paragraph({ children: [], spacing: { after: 80 } }));
        }

        if (noSectionArticles.length > 0) {
            bodyChildren.push(makeSectionArticlesTable(noSectionArticles));
            bodyChildren.push(new Paragraph({ children: [], spacing: { after: 80 } }));
        }

        if (bodyChildren.length === 0) {
            bodyChildren.push(new Paragraph({
                children: [new TextRun({ text: 'Статьи за выбранный период не найдены.', size: 20 })],
            }));
        }

        // Дисклеймер — plain text, не в рамке, после всех статей
        bodyChildren.push(new Paragraph({
            children: [new TextRun({
                text: 'Обзор подготовлен специалистами ООО «Инженеры информации» - информационным центром Сети КонсультантПлюс в г. Волгограде и г. Волжском.',
                size: 18,
                italics: true,
            })],
            alignment: AlignmentType.LEFT,
            spacing: { before: 120, after: 0 },
        }));

        // Первая страница: логотип + таблица-колонтитул
        // Заголовок выпуска перенесён в тело документа
        const firstHeaderChildren = [];
        if (headerImageBuffer) {
            firstHeaderChildren.push(new Paragraph({
                children: [new ImageRun({
                    data: headerImageBuffer,
                    transformation: { width: 680, height: 159 },
                    type: imageType,
                })],
                alignment: AlignmentType.CENTER,
                spacing: { after: 30 },
            }));
        }
        firstHeaderChildren.push(makeIssueTable(issueDateStr));
        firstHeaderChildren.push(new Paragraph({ children: [], spacing: { before: 0, after: 0 } }));

        const pageSize = { width: mm(210), height: mm(297) };
        const commonMargin = { right: mm(15), bottom: mm(20), left: mm(15), header: mm(8), footer: mm(10) };

        // top = mm(18): -10мм от предыдущего mm(28) по запросу пользователя.
        // На стр.1 шапка (лого+issue) ~36мм > 18мм — Word авто-расширяет.
        // Стр.2+ (только issue ~16мм) получают минимальный отступ.
        const top = mm(18);

        const docSections = [{
            properties: {
                page: { size: pageSize, margin: { top, ...commonMargin } },
                column: { space: mm(5), count: 2, separator: true },
                titlePage: true,
            },
            headers: {
                first: new Header({ children: firstHeaderChildren }),
                default: new Header({ children: [makeIssueTable(issueDateStr)] }),
            },
            footers: { default: makeFooter(), first: makeFooter() },
            children: bodyChildren,
        }];

        const doc = new Document({ sections: docSections });
        const docxBuffer = await Packer.toBuffer(doc);

        if (format === 'pdf') {
            const pdfBuffer = await convertService.convertDocxBufferToPDF(docxBuffer);
            const filename = `Obzor-nz-${dateFrom}-${dateTo}.pdf`;
            const encodedName = encodeURIComponent(filename);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedName}`);
            res.setHeader('Content-Length', pdfBuffer.length);
            return res.send(pdfBuffer);
        }

        const filename = `Obzor-nz-${dateFrom}-${dateTo}.docx`;
        const encodedName = encodeURIComponent(filename);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedName}`);
        res.setHeader('Content-Length', docxBuffer.length);
        res.send(docxBuffer);

    } catch (err) {
        logger.error('GET /pro-review/generate:', err);
        res.status(500).json({ success: false, message: 'Ошибка генерации документа' });
    }
});

module.exports = router;
