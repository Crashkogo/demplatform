'use strict';

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { Op } = require('sequelize');
const {
    Document, Paragraph, TextRun, Header, Footer, ImageRun,
    AlignmentType, BorderStyle, ShadingType, Packer,
    Table, TableRow, TableCell, WidthType,
} = require('docx');

const { Article, ArticleSection, HeaderImage, User } = require('../models');
const { authenticateToken } = require('../middleware/auth');
const { htmlToDocxParagraphs } = require('../utils/htmlToDocx');
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

// Таблица колонтитула: № слева, дата справа, рамка вокруг
// Используем границы на ячейках (не на таблице) — cell border имеет приоритет над table border
function makeIssueTable(issueNum, dateStr) {
    const outerV = { style: BorderStyle.SINGLE, size: 12, color: '000000' };
    const noB = { style: BorderStyle.NONE, size: 0, color: 'auto' };
    return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: noTableBorder,
        rows: [
            new TableRow({
                children: [
                    new TableCell({
                        borders: { top: outerV, bottom: outerV, left: outerV, right: noB },
                        margins: { top: 60, bottom: 60, left: 120, right: 60 },
                        children: [new Paragraph({
                            children: [new TextRun({ text: `№ ${issueNum} НОВОСТИ ЗАКОНОДАТЕЛЬСТВА`, bold: true, size: 18 })],
                            alignment: AlignmentType.LEFT,
                        })],
                        width: { size: 65, type: WidthType.PERCENTAGE },
                    }),
                    new TableCell({
                        borders: { top: outerV, bottom: outerV, left: noB, right: outerV },
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

// Футер: таблица с верхней рамкой (граница на ячейке, не на таблице)
function makeFooter() {
    const topBorderOnly = {
        top: { style: BorderStyle.SINGLE, size: 12, color: '000000' },
        bottom: { style: BorderStyle.NONE, size: 0, color: 'auto' },
        left: { style: BorderStyle.NONE, size: 0, color: 'auto' },
        right: { style: BorderStyle.NONE, size: 0, color: 'auto' },
    };
    return new Footer({
        children: [
            new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                borders: noTableBorder,
                rows: [
                    new TableRow({
                        children: [
                            new TableCell({
                                borders: topBorderOnly,
                                margins: { top: 60, bottom: 60, left: 60, right: 60 },
                                children: [new Paragraph({
                                    children: [new TextRun({
                                        text: 'ООО «Инженеры информации», ООО «ЦПИ Эксперт»        тел (8443) 300-800, (8442) 300-800        e-mail: mail@enginf.ru',
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

// Статья в рамке: заголовок (серый фон, курсив, 9pt) + контент
// Граница на ячейке — cell border имеет приоритет
function makeArticleBox(titleText, contentParas) {
    const titlePara = new Paragraph({
        children: [new TextRun({ text: titleText, size: 18, italics: true })],
        alignment: AlignmentType.CENTER,
        shading: { type: ShadingType.SOLID, color: 'D9D9D9', fill: 'D9D9D9' },
        spacing: { before: 40, after: 40 },
    });

    const allSides = {
        top: { style: BorderStyle.SINGLE, size: 8, color: '000000' },
        bottom: { style: BorderStyle.SINGLE, size: 8, color: '000000' },
        left: { style: BorderStyle.SINGLE, size: 8, color: '000000' },
        right: { style: BorderStyle.SINGLE, size: 8, color: '000000' },
    };
    return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: noTableBorder,
        rows: [
            new TableRow({
                children: [
                    new TableCell({
                        borders: allSides,
                        margins: { top: 60, bottom: 60, left: 80, right: 80 },
                        children: [titlePara, ...contentParas],
                    }),
                ],
            }),
        ],
    });
}

router.get('/pro-review/generate', authenticateToken, canGenerate, async (req, res) => {
    try {
        const { issueNumber, dateFrom, dateTo, title } = req.query;
        if (!issueNumber || !dateFrom || !dateTo) {
            return res.status(400).json({ success: false, message: 'issueNumber, dateFrom, dateTo обязательны' });
        }

        const dateFromObj = new Date(dateFrom);
        const dateToObj = new Date(dateTo);
        dateToObj.setHours(23, 59, 59, 999);

        const fmtDate = (d) => d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
        const issueDateStr = `с ${fmtDate(dateFromObj)} по ${fmtDate(dateToObj)}`;

        // Шапочное изображение
        let headerImageBuffer = null;
        let imageType = 'png';
        const headerImg = await HeaderImage.findOne({ order: [['createdAt', 'DESC']] });
        if (headerImg) {
            const imgPath = path.resolve(headerImg.path);
            if (fs.existsSync(imgPath)) {
                headerImageBuffer = fs.readFileSync(imgPath);
                const ext = path.extname(headerImg.filename).toLowerCase().replace('.', '');
                imageType = (ext === 'jpg' || ext === 'jpeg') ? 'jpg' : 'png';
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
                shading: { type: ShadingType.SOLID, color: 'CCCCCC', fill: 'CCCCCC' },
                spacing: { before: 100, after: 60 },
                border: {
                    top: { style: BorderStyle.SINGLE, size: 8, color: '000000' },
                    bottom: { style: BorderStyle.SINGLE, size: 8, color: '000000' },
                    left: { style: BorderStyle.SINGLE, size: 8, color: '000000' },
                    right: { style: BorderStyle.SINGLE, size: 8, color: '000000' },
                },
            }));

            for (const article of arts) {
                bodyChildren.push(makeArticleBox(article.title, htmlToDocxParagraphs(article.content, { size: 20 })));
                bodyChildren.push(new Paragraph({ children: [], spacing: { after: 60 } }));
            }
        }

        if (noSectionArticles.length > 0) {
            for (const article of noSectionArticles) {
                bodyChildren.push(makeArticleBox(article.title, htmlToDocxParagraphs(article.content, { size: 20 })));
                bodyChildren.push(new Paragraph({ children: [], spacing: { after: 60 } }));
            }
        }

        if (bodyChildren.length === 0) {
            bodyChildren.push(new Paragraph({
                children: [new TextRun({ text: 'Статьи за выбранный период не найдены.', size: 20 })],
            }));
        }

        // Первая страница: логотип + [заголовок выпуска] + таблица-колонтитул
        // Заголовок помещаем в first-page header — не нужны CONTINUOUS-секции,
        // статьи начинаются сразу на стр.1 в 2-колоночном потоке.
        const firstHeaderChildren = [];
        if (headerImageBuffer) {
            firstHeaderChildren.push(new Paragraph({
                children: [new ImageRun({
                    data: headerImageBuffer,
                    transformation: { width: 620, height: 100 },
                    type: imageType,
                })],
                alignment: AlignmentType.CENTER,
                spacing: { after: 30 },
            }));
        }
        firstHeaderChildren.push(makeIssueTable(issueNumber, issueDateStr));

        if (title && title.trim()) {
            firstHeaderChildren.push(new Paragraph({
                children: [new TextRun({
                    text: title.trim().toUpperCase(),
                    bold: true,
                    size: 40,
                    font: 'Comic Sans MS',
                })],
                alignment: AlignmentType.CENTER,
                border: {
                    top: { style: BorderStyle.SINGLE, size: 8, color: '000000' },
                    bottom: { style: BorderStyle.SINGLE, size: 8, color: '000000' },
                    left: { style: BorderStyle.SINGLE, size: 8, color: '000000' },
                    right: { style: BorderStyle.SINGLE, size: 8, color: '000000' },
                },
                spacing: { before: 80, after: 80 },
            }));
        }

        const pageSize = { width: mm(210), height: mm(297) };
        const commonMargin = { right: mm(15), bottom: mm(20), left: mm(15), header: mm(8), footer: mm(10) };

        // Стр.1: лого(~35мм) + таблица(~12мм) + [заголовок(~20мм)] + отступ
        // Одна секция → все страницы имеют одинаковый top-margin
        const topPage1 = title && title.trim() ? mm(75) : mm(55);

        const docSections = [{
            properties: {
                page: { size: pageSize, margin: { top: topPage1, ...commonMargin } },
                column: { space: mm(5), count: 2, separator: true },
                titlePage: true,
            },
            headers: {
                first: new Header({ children: firstHeaderChildren }),
                default: new Header({ children: [makeIssueTable(issueNumber, issueDateStr)] }),
            },
            footers: { default: makeFooter(), first: makeFooter() },
            children: bodyChildren,
        }];

        const doc = new Document({ sections: docSections });
        const buffer = await Packer.toBuffer(doc);
        const filename = `Pro-obzor-N${issueNumber}.docx`;
        const encodedName = encodeURIComponent(filename);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedName}`);
        res.setHeader('Content-Length', buffer.length);
        res.send(buffer);

    } catch (err) {
        logger.error('GET /pro-review/generate:', err);
        res.status(500).json({ success: false, message: 'Ошибка генерации DOCX: ' + err.message });
    }
});

module.exports = router;
