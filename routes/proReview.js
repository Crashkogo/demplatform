'use strict';

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { Op } = require('sequelize');
const {
    Document, Paragraph, TextRun, Header, Footer, ImageRun,
    AlignmentType, BorderStyle, ShadingType, Packer,
    Table, TableRow, TableCell, WidthType, SectionType,
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

const noBorder = {
    top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
};

// Таблица-заголовок колонтитула: № слева, дата справа, рамка вокруг
function makeIssueTable(issueNum, dateStr) {
    return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
            top: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
            bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
            left: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
            right: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
            insideH: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
            insideV: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        },
        rows: [
            new TableRow({
                children: [
                    new TableCell({
                        borders: noBorder,
                        margins: { top: 60, bottom: 60, left: 120, right: 60 },
                        children: [new Paragraph({
                            children: [new TextRun({ text: `№ ${issueNum} НОВОСТИ ЗАКОНОДАТЕЛЬСТВА`, bold: true, size: 18 })],
                            alignment: AlignmentType.LEFT,
                        })],
                        width: { size: 65, type: WidthType.PERCENTAGE },
                    }),
                    new TableCell({
                        borders: noBorder,
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

function makeFooterPara() {
    return new Paragraph({
        children: [new TextRun({
            text: 'ООО «Инженеры информации», ООО «ЦПИ Эксперт»        тел (8443) 300-800, (8442) 300-800        e-mail: mail@enginf.ru',
            size: 16,
        })],
        alignment: AlignmentType.CENTER,
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: '000000', space: 4 } },
    });
}

// Обернуть статью в таблицу с рамкой
function makeArticleBox(titleText, contentParas) {
    const titlePara = new Paragraph({
        children: [new TextRun({ text: titleText, size: 18, italics: true })],
        alignment: AlignmentType.CENTER,
        shading: { type: ShadingType.SOLID, color: 'D9D9D9', fill: 'D9D9D9' },
        spacing: { before: 40, after: 40 },
    });

    return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
            top: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
            bottom: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
            left: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
            right: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
            insideH: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
            insideV: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        },
        rows: [
            new TableRow({
                children: [
                    new TableCell({
                        borders: noBorder,
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

        // Загрузить статьи
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

        // Построить 2-колоночный контент
        const bodyChildren = [];

        for (const section of allSections) {
            const arts = sectionArticles.get(section.id) || [];
            if (arts.length === 0) continue;

            // Заголовок раздела — Comic Sans 14pt, серый, рамка
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
                    top: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
                    bottom: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
                    left: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
                    right: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
                },
            }));

            for (const article of arts) {
                const contentParas = htmlToDocxParagraphs(article.content, { size: 20 });
                bodyChildren.push(makeArticleBox(article.title, contentParas));
                // Пустой параграф между статьями
                bodyChildren.push(new Paragraph({ children: [], spacing: { after: 60 } }));
            }
        }

        if (noSectionArticles.length > 0) {
            for (const article of noSectionArticles) {
                const contentParas = htmlToDocxParagraphs(article.content, { size: 20 });
                bodyChildren.push(makeArticleBox(article.title, contentParas));
                bodyChildren.push(new Paragraph({ children: [], spacing: { after: 60 } }));
            }
        }

        if (bodyChildren.length === 0) {
            bodyChildren.push(new Paragraph({
                children: [new TextRun({ text: 'Статьи за выбранный период не найдены.', size: 20 })],
            }));
        }

        // Колонтитулы
        const firstHeaderChildren = [];
        if (headerImageBuffer) {
            firstHeaderChildren.push(new Paragraph({
                children: [new ImageRun({
                    data: headerImageBuffer,
                    transformation: { width: 620, height: 130 },
                    type: imageType,
                })],
                alignment: AlignmentType.CENTER,
                spacing: { after: 40 },
            }));
        }
        firstHeaderChildren.push(makeIssueTable(issueNumber, issueDateStr));

        const pageSettings = {
            size: { width: mm(210), height: mm(297) },
            margin: {
                top: mm(28),
                right: mm(15),
                bottom: mm(20),
                left: mm(15),
                header: mm(8),
                footer: mm(8),
            },
        };

        const sections = [];

        if (title && title.trim()) {
            // Секция 1: заголовок во всю ширину (1 колонка)
            const titlePara = new Paragraph({
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
            });

            sections.push({
                properties: {
                    type: SectionType.CONTINUOUS,
                    page: pageSettings,
                    titlePage: true,
                },
                headers: {
                    default: new Header({ children: [makeIssueTable(issueNumber, issueDateStr)] }),
                    first: new Header({ children: firstHeaderChildren }),
                },
                footers: {
                    default: new Footer({ children: [makeFooterPara()] }),
                    first: new Footer({ children: [makeFooterPara()] }),
                },
                children: [titlePara],
            });

            // Секция 2: 2 колонки (наследует заголовки)
            sections.push({
                properties: {
                    type: SectionType.CONTINUOUS,
                    column: { space: mm(5), count: 2, separator: true },
                },
                headers: {
                    default: new Header({ children: [makeIssueTable(issueNumber, issueDateStr)] }),
                },
                footers: {
                    default: new Footer({ children: [makeFooterPara()] }),
                },
                children: bodyChildren,
            });
        } else {
            sections.push({
                properties: {
                    page: pageSettings,
                    column: { space: mm(5), count: 2, separator: true },
                    titlePage: true,
                },
                headers: {
                    default: new Header({ children: [makeIssueTable(issueNumber, issueDateStr)] }),
                    first: new Header({ children: firstHeaderChildren }),
                },
                footers: {
                    default: new Footer({ children: [makeFooterPara()] }),
                    first: new Footer({ children: [makeFooterPara()] }),
                },
                children: bodyChildren,
            });
        }

        const doc = new Document({ sections });
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
