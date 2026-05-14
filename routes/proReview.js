'use strict';

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { Op } = require('sequelize');

const {
    Document, Paragraph, TextRun, Header, Footer, ImageRun,
    AlignmentType, BorderStyle, ShadingType, Packer,
    PageBorderDisplay, PageBorderOffsetFrom,
} = require('docx');

const { Article, ArticleSection, HeaderImage, User } = require('../models');
const { authenticateToken } = require('../middleware/auth');
const { htmlToDocxParagraphs } = require('../utils/htmlToDocx');
const logger = require('../utils/logger');

// Перевод миллиметров в единицы DXA (twips): 1 мм ≈ 56.69 twips
const mm = (val) => Math.round(val * 56.69);

const canGenerate = (req, res, next) => {
    const role = req.user.roleData;
    if (!role) return res.status(403).json({ success: false, message: 'Нет доступа' });
    if (role.isAdmin || role.canGenerateProReview) return next();
    return res.status(403).json({ success: false, message: 'Нет права формирования про-обзора' });
};

function makeIssuePara(text) {
    return new Paragraph({
        children: [new TextRun({ text, bold: true, size: 18 })],
        alignment: AlignmentType.CENTER,
        border: {
            bottom: { style: BorderStyle.SINGLE, size: 4, color: '000000', space: 4 },
        },
        spacing: { after: 60 },
    });
}

function makeFooterPara() {
    return new Paragraph({
        children: [new TextRun({
            text: 'ООО «Инженеры информации», ООО «ЦПИ Эксперт»        тел (8443) 300-800, (8442) 300-800        e-mail: mail@enginf.ru',
            size: 16,
        })],
        alignment: AlignmentType.CENTER,
        border: {
            top: { style: BorderStyle.SINGLE, size: 4, color: '000000', space: 4 },
        },
    });
}

router.get('/pro-review/generate', authenticateToken, canGenerate, async (req, res) => {
    try {
        const { issueNumber, dateFrom, dateTo, title } = req.query;
        if (!issueNumber || !dateFrom || !dateTo) {
            return res.status(400).json({
                success: false,
                message: 'issueNumber, dateFrom, dateTo обязательны',
            });
        }

        const dateFromObj = new Date(dateFrom);
        const dateToObj = new Date(dateTo);
        dateToObj.setHours(23, 59, 59, 999);

        const fmtDate = (d) =>
            d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

        const issueLineText =
            `№ ${issueNumber} НОВОСТИ ЗАКОНОДАТЕЛЬСТВА    с ${fmtDate(dateFromObj)} по ${fmtDate(dateToObj)}`;

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

        // Загрузить статьи за период
        const articles = await Article.findAll({
            where: { publishedAt: { [Op.between]: [dateFromObj, dateToObj] } },
            include: [
                { model: ArticleSection, as: 'sections', through: { attributes: [] } },
                { model: User, as: 'author', attributes: ['id', 'login'] },
            ],
            order: [['publishedAt', 'ASC']],
        });

        // Все разделы в нужном порядке
        const allSections = await ArticleSection.findAll({
            order: [['sortOrder', 'ASC'], ['name', 'ASC']],
        });

        // Распределить статьи по разделам
        const sectionArticles = new Map();
        for (const s of allSections) sectionArticles.set(s.id, []);
        const noSectionArticles = [];

        for (const article of articles) {
            if (article.sections && article.sections.length > 0) {
                const sorted = article.sections
                    .slice()
                    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
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

        // Формирование тела документа
        const bodyChildren = [];

        if (title && title.trim()) {
            bodyChildren.push(new Paragraph({
                children: [new TextRun({ text: title.trim(), bold: true, size: 32, allCaps: true })],
                alignment: AlignmentType.CENTER,
                spacing: { before: 120, after: 200 },
            }));
        }

        for (const section of allSections) {
            const arts = sectionArticles.get(section.id) || [];
            if (arts.length === 0) continue;

            // Заголовок раздела — серый фон, жирный, caps
            bodyChildren.push(new Paragraph({
                children: [new TextRun({ text: section.name.toUpperCase(), bold: true, size: 22 })],
                spacing: { before: 160, after: 80 },
                border: {
                    top: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
                    bottom: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
                },
                shading: {
                    type: ShadingType.SOLID,
                    color: 'CCCCCC',
                    fill: 'CCCCCC',
                },
            }));

            for (const article of arts) {
                bodyChildren.push(new Paragraph({
                    children: [new TextRun({ text: article.title, bold: true, size: 20 })],
                    spacing: { before: 80, after: 40 },
                }));
                bodyChildren.push(...htmlToDocxParagraphs(article.content, { size: 20 }));
            }
        }

        if (noSectionArticles.length > 0) {
            for (const article of noSectionArticles) {
                bodyChildren.push(new Paragraph({
                    children: [new TextRun({ text: article.title, bold: true, size: 20 })],
                    spacing: { before: 80, after: 40 },
                }));
                bodyChildren.push(...htmlToDocxParagraphs(article.content, { size: 20 }));
            }
        }

        if (bodyChildren.length === 0) {
            bodyChildren.push(new Paragraph({
                children: [new TextRun({ text: 'Статьи за выбранный период не найдены.', size: 20 })],
            }));
        }

        // Заголовки: первая страница (с логотипом) и остальные
        const defaultHeaderChildren = [makeIssuePara(issueLineText)];
        const firstHeaderChildren = [];

        if (headerImageBuffer) {
            firstHeaderChildren.push(new Paragraph({
                children: [new ImageRun({
                    data: headerImageBuffer,
                    transformation: { width: 540, height: 90 },
                    type: imageType,
                })],
                alignment: AlignmentType.CENTER,
                spacing: { after: 40 },
            }));
        }
        firstHeaderChildren.push(makeIssuePara(issueLineText));

        // Настройки страницы: A4, поля, рамка
        const pageSettings = {
            size: { width: mm(210), height: mm(297) },
            margin: {
                top: mm(20),
                right: mm(15),
                bottom: mm(20),
                left: mm(15),
                header: mm(10),
                footer: mm(10),
            },
            borders: {
                pageBorderTop: { style: BorderStyle.SINGLE, size: 6, space: 24, color: '000000' },
                pageBorderBottom: { style: BorderStyle.SINGLE, size: 6, space: 24, color: '000000' },
                pageBorderLeft: { style: BorderStyle.SINGLE, size: 6, space: 24, color: '000000' },
                pageBorderRight: { style: BorderStyle.SINGLE, size: 6, space: 24, color: '000000' },
                display: PageBorderDisplay.ALL_PAGES,
                offsetFrom: PageBorderOffsetFrom.PAGE,
            },
        };

        const doc = new Document({
            sections: [{
                properties: {
                    page: pageSettings,
                    column: { space: mm(5), count: 2, separator: true },
                    titlePage: true,
                },
                headers: {
                    default: new Header({ children: defaultHeaderChildren }),
                    first: new Header({ children: firstHeaderChildren }),
                },
                footers: {
                    default: new Footer({ children: [makeFooterPara()] }),
                    first: new Footer({ children: [makeFooterPara()] }),
                },
                children: bodyChildren,
            }],
        });

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
