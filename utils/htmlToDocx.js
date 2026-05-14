'use strict';

const { parse } = require('node-html-parser');
const {
    Paragraph,
    TextRun,
    ExternalHyperlink,
    UnderlineType,
    AlignmentType,
} = require('docx');

/**
 * Рекурсивно обходит inline-узлы HTML и возвращает массив TextRun / ExternalHyperlink.
 */
function parseInline(node, bold = false, italic = false, underline = false) {
    const runs = [];
    for (const child of node.childNodes) {
        if (child.nodeType === 3) {
            const text = child.text;
            if (!text) continue;
            runs.push(new TextRun({
                text,
                bold,
                italics: italic,
                underline: underline ? { type: UnderlineType.SINGLE } : undefined,
            }));
        } else {
            const tag = (child.tagName || '').toLowerCase();
            if (tag === 'strong' || tag === 'b') {
                runs.push(...parseInline(child, true, italic, underline));
            } else if (tag === 'em' || tag === 'i') {
                runs.push(...parseInline(child, bold, true, underline));
            } else if (tag === 'u') {
                runs.push(...parseInline(child, bold, italic, true));
            } else if (tag === 'br') {
                runs.push(new TextRun({ text: '', break: 1 }));
            } else if (tag === 'a') {
                const href = child.getAttribute('href');
                if (href) {
                    runs.push(new ExternalHyperlink({
                        link: href,
                        children: [
                            new TextRun({
                                text: child.text,
                                bold,
                                italics: italic,
                                style: 'Hyperlink',
                                underline: { type: UnderlineType.SINGLE },
                                color: '0563C1',
                            }),
                        ],
                    }));
                } else {
                    runs.push(...parseInline(child, bold, italic, underline));
                }
            } else {
                runs.push(...parseInline(child, bold, italic, underline));
            }
        }
    }
    return runs;
}

/**
 * Конвертирует HTML-строку из TinyMCE в массив Paragraph-объектов для docx.
 */
function htmlToDocxParagraphs(html, opts = {}) {
    if (!html || !html.trim()) {
        return [new Paragraph({ children: [] })];
    }

    const root = parse(html);
    const paragraphs = [];
    const size = opts.size || 20;

    for (const node of root.childNodes) {
        if (node.nodeType === 3) {
            const text = node.text.trim();
            if (text) {
                paragraphs.push(new Paragraph({
                    children: [new TextRun({ text, size })],
                }));
            }
            continue;
        }

        const tag = (node.tagName || '').toLowerCase();
        if (!tag) continue;

        if (tag === 'p') {
            const children = parseInline(node);
            paragraphs.push(new Paragraph({
                children: children.length ? children : [new TextRun({ text: '', size })],
                spacing: { after: 60 },
            }));
        } else if (tag === 'ul') {
            for (const li of node.querySelectorAll('li')) {
                paragraphs.push(new Paragraph({
                    children: parseInline(li),
                    bullet: { level: 0 },
                    spacing: { after: 40 },
                }));
            }
        } else if (tag === 'ol') {
            let idx = 1;
            for (const li of node.querySelectorAll('li')) {
                paragraphs.push(new Paragraph({
                    children: [
                        new TextRun({ text: `${idx}. `, size }),
                        ...parseInline(li),
                    ],
                    spacing: { after: 40 },
                }));
                idx++;
            }
        } else if (tag === 'br') {
            paragraphs.push(new Paragraph({ children: [] }));
        } else {
            const children = parseInline(node);
            if (children.length) {
                paragraphs.push(new Paragraph({
                    children,
                    spacing: { after: 60 },
                }));
            }
        }
    }

    return paragraphs.length ? paragraphs : [new Paragraph({ children: [] })];
}

module.exports = { htmlToDocxParagraphs };
