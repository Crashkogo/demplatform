'use strict';

const { parse } = require('node-html-parser');
const {
    Paragraph,
    TextRun,
    ExternalHyperlink,
    AlignmentType,
    UnderlineType,
} = require('docx');

// CSS font-size → docx half-points
function cssSizeToHalfPt(sizeStr) {
    if (!sizeStr) return null;
    const pt = sizeStr.match(/^([\d.]+)pt$/i);
    if (pt) return Math.round(parseFloat(pt[1]) * 2);
    const px = sizeStr.match(/^([\d.]+)px$/i);
    if (px) return Math.round(parseFloat(px[1]) * 1.5);
    return null;
}

// "font-size: 12pt; color: red" → { 'font-size': '12pt', 'color': 'red' }
function parseStyle(styleStr) {
    if (!styleStr) return {};
    const result = {};
    for (const decl of styleStr.split(';')) {
        const idx = decl.indexOf(':');
        if (idx < 0) continue;
        const prop = decl.slice(0, idx).trim().toLowerCase();
        const val  = decl.slice(idx + 1).trim();
        if (prop && val) result[prop] = val;
    }
    return result;
}

// CSS color → 6-char hex string or null
function cssColorToHex(val) {
    if (!val) return null;
    val = val.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(val)) return val.slice(1).toUpperCase();
    if (/^#[0-9a-fA-F]{3}$/.test(val)) {
        const [, r, g, b] = val.match(/^#(.)(.)(.)$/);
        return (r+r+g+g+b+b).toUpperCase();
    }
    const rgb = val.match(/^rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\)/i);
    if (rgb) {
        return [rgb[1], rgb[2], rgb[3]]
            .map(n => parseInt(n).toString(16).padStart(2, '0'))
            .join('').toUpperCase();
    }
    return null;
}

function cssAlignToDocx(align) {
    if (!align) return undefined;
    switch (align.toLowerCase().trim()) {
        case 'center':  return AlignmentType.CENTER;
        case 'right':   return AlignmentType.RIGHT;
        case 'justify': return AlignmentType.JUSTIFIED;
        case 'left':    return AlignmentType.LEFT;
        default:        return undefined;
    }
}

// Применяет CSS-стиль поверх текущего inline-состояния
function applyStyle(state, styleStr) {
    const s = parseStyle(styleStr);
    const next = { ...state };
    if (s['font-size']) {
        const hp = cssSizeToHalfPt(s['font-size']);
        if (hp) next.size = hp;
    }
    if (s['font-family']) {
        next.font = s['font-family'].replace(/['"]/g, '').split(',')[0].trim();
    }
    if (s['font-weight']) {
        const fw = s['font-weight'].toLowerCase();
        if (fw === 'bold' || parseInt(fw) >= 700) next.bold = true;
    }
    if (s['font-style'] === 'italic') next.italic = true;
    if (s['text-decoration'] && s['text-decoration'].includes('underline')) next.underline = true;
    if (s['color']) {
        const hex = cssColorToHex(s['color']);
        if (hex) next.color = hex;
    }
    return next;
}

// Рекурсивный обход inline-узлов
// state: { bold, italic, underline, size, font, color }
function parseInline(node, state = {}) {
    const runs = [];

    for (const child of node.childNodes) {
        if (child.nodeType === 3) {
            const text = child.text;
            if (!text) continue;
            runs.push(new TextRun({
                text,
                bold:      state.bold      || undefined,
                italics:   state.italic    || undefined,
                underline: state.underline ? { type: UnderlineType.SINGLE } : undefined,
                size:      state.size      || undefined,
                font:      state.font      || undefined,
                color:     state.color     || undefined,
            }));
            continue;
        }

        const tag = (child.tagName || '').toLowerCase();
        let next = { ...state };

        const inlineStyle = child.getAttribute('style');
        if (inlineStyle) next = applyStyle(next, inlineStyle);

        if (tag === 'strong' || tag === 'b') {
            next.bold = true;
            runs.push(...parseInline(child, next));
        } else if (tag === 'em' || tag === 'i') {
            next.italic = true;
            runs.push(...parseInline(child, next));
        } else if (tag === 'u') {
            next.underline = true;
            runs.push(...parseInline(child, next));
        } else if (tag === 'br') {
            runs.push(new TextRun({ text: '', break: 1 }));
        } else if (tag === 'a') {
            const href = child.getAttribute('href');
            if (href) {
                const linkState = { ...next, color: '0563C1', underline: true };
                const linkRuns = parseInline(child, linkState)
                    .filter(r => r instanceof TextRun);
                if (linkRuns.length) {
                    runs.push(new ExternalHyperlink({ link: href, children: linkRuns }));
                }
            } else {
                runs.push(...parseInline(child, next));
            }
        } else {
            runs.push(...parseInline(child, next));
        }
    }
    return runs;
}

/**
 * Конвертирует HTML (TinyMCE) в массив Paragraph для docx.
 * opts.size — размер по умолчанию в half-points (20 = 10pt).
 */
function htmlToDocxParagraphs(html, opts = {}) {
    if (!html || !html.trim()) return [new Paragraph({ children: [] })];

    const root = parse(html);
    const paragraphs = [];
    const defaultSize = opts.size || 20;
    const firstLine   = 283; // ~5мм абзацный отступ (twips)

    function processNode(node) {
        if (node.nodeType === 3) {
            const text = node.text.trim();
            if (text) {
                paragraphs.push(new Paragraph({
                    children: [new TextRun({ text, size: defaultSize })],
                    indent: { firstLine },
                }));
            }
            return;
        }

        const tag = (node.tagName || '').toLowerCase();
        if (!tag) return;

        if (tag === 'p') {
            const style     = parseStyle(node.getAttribute('style') || '');
            const alignment = cssAlignToDocx(style['text-align']);
            const children  = parseInline(node, { size: defaultSize });
            paragraphs.push(new Paragraph({
                children: children.length ? children : [new TextRun({ text: '', size: defaultSize })],
                alignment,
                indent: { firstLine },
                spacing: { after: 60 },
            }));

        } else if (tag === 'ul') {
            for (const li of node.querySelectorAll('li')) {
                paragraphs.push(new Paragraph({
                    children: parseInline(li, { size: defaultSize }),
                    bullet: { level: 0 },
                    spacing: { after: 40 },
                }));
            }

        } else if (tag === 'ol') {
            let idx = 1;
            for (const li of node.querySelectorAll('li')) {
                paragraphs.push(new Paragraph({
                    children: [
                        new TextRun({ text: `${idx}. `, size: defaultSize }),
                        ...parseInline(li, { size: defaultSize }),
                    ],
                    spacing: { after: 40 },
                }));
                idx++;
            }

        } else if (tag === 'br') {
            paragraphs.push(new Paragraph({ children: [] }));

        } else if (tag === 'div' || tag === 'section' || tag === 'article') {
            for (const child of node.childNodes) processNode(child);

        } else {
            // h1-h6, blockquote и т.д.
            const children = parseInline(node, { size: defaultSize });
            if (children.length) {
                paragraphs.push(new Paragraph({
                    children,
                    indent: { firstLine },
                    spacing: { after: 60 },
                }));
            }
        }
    }

    for (const node of root.childNodes) processNode(node);

    return paragraphs.length ? paragraphs : [new Paragraph({ children: [] })];
}

module.exports = { htmlToDocxParagraphs };
