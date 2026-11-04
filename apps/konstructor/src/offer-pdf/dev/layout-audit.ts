import type { LayoutBox, LayoutNode } from '../lib/pdf-layout';

/**
 * Проверки дерева раскладки react-pdf (то, что движок посчитал перед
 * отрисовкой): координаты каждого блока известны, поэтому «ползёт» ловится
 * числами, а не глазами. Без привязки к шаблону: fixed-блоки считаются
 * шапкой или подвалом по положению на странице.
 */

export type LayoutIssueKind =
    | 'header-overlap'
    | 'footer-overlap'
    | 'out-of-page'
    | 'fixed-out-of-page'
    | 'orphan-heading'
    | 'orphan-totals';

export interface LayoutIssue {
    page: number;
    kind: LayoutIssueKind;
    text: string;
    detail: string;
}

export interface PageAudit {
    page: number;
    height: number;
    paddingTop: number;
    paddingBottom: number;
    headerBottom: number | null;
    footerTop: number | null;
    contentTop: number | null;
    contentBottom: number | null;
    firstText: string;
    lastText: string;
}

export interface LayoutAudit {
    pages: PageAudit[];
    issues: LayoutIssue[];
}

/** Листовой блок в абсолютных координатах страницы */
interface Leaf {
    node: LayoutNode;
    box: LayoutBox;
    fixed: boolean;
}

const textOf = (node: LayoutNode): string => {
    if (node.type === 'TEXT') {
        return (node.lines ?? [])
            .map(line => line.string)
            .join(' ')
            .trim();
    }
    return (node.children ?? [])
        .map(textOf)
        .filter(Boolean)
        .join(' ')
        .trim();
};

/** Листовые блоки в порядке документа; смещения родителей сложены */
const leaves = (node: LayoutNode, offsetTop = 0, offsetLeft = 0, fixed = false): Leaf[] => {
    if (!node.box) return [];
    const isFixed = fixed || Boolean(node.props?.fixed);
    const box: LayoutBox = {
        top: offsetTop + node.box.top,
        left: offsetLeft + node.box.left,
        width: node.box.width,
        height: node.box.height,
    };
    const children = node.children ?? [];
    if (!children.length || node.type === 'TEXT') return [{ node, box, fixed: isFixed }];
    return children.flatMap(child => leaves(child, box.top, box.left, isFixed));
};

const bottomOf = (box: LayoutBox): number => box.top + box.height;

/** Заголовок раздела: кегль заметно крупнее базового */
const isHeading = (node: LayoutNode): boolean =>
    node.type === 'TEXT' && (node.style?.fontSize ?? 0) >= 13;

const clip = (text: string): string => text.slice(0, 60);

const EPSILON = 0.5;

export const auditLayout = (root: LayoutNode): LayoutAudit => {
    const pages: PageAudit[] = [];
    const issues: LayoutIssue[] = [];
    const pageNodes = (root.children ?? []).flatMap(node =>
        node.type === 'PAGE' ? [node] : (node.children ?? []),
    );

    pageNodes.forEach((page, index) => {
        const number = index + 1;
        const height = page.box?.height ?? 0;
        const paddingTop = page.style?.paddingTop ?? 0;
        const paddingBottom = page.style?.paddingBottom ?? 0;
        // страница — сама начало координат
        const all = (page.children ?? []).flatMap(child => leaves(child, 0, 0));
        const fixed = all.filter(item => item.fixed);
        const content = all.filter(item => !item.fixed);
        // шапка — fixed-блоки в верхней половине листа, подвал — в нижней;
        // блок, растянутый через обе половины, уже сломан (fixed-out-of-page)
        const headerBottom = fixed
            .filter(item => bottomOf(item.box) <= height / 2)
            .reduce<number | null>((max, item) => Math.max(max ?? 0, bottomOf(item.box)), null);
        const footerTop = fixed
            .filter(item => item.box.top >= height / 2)
            .reduce<number | null>((min, item) => Math.min(min ?? height, item.box.top), null);
        const contentTop = content.length ? Math.min(...content.map(item => item.box.top)) : null;
        const contentBottom = content.length
            ? Math.max(...content.map(item => bottomOf(item.box)))
            : null;
        const lastContent = content[content.length - 1];

        pages.push({
            page: number,
            height,
            paddingTop,
            paddingBottom,
            headerBottom,
            footerTop,
            contentTop,
            contentBottom,
            firstText: content[0] ? clip(textOf(content[0].node)) : '',
            lastText: lastContent ? clip(textOf(lastContent.node)) : '',
        });

        for (const item of fixed) {
            if (item.box.top < -EPSILON || bottomOf(item.box) > height + EPSILON) {
                issues.push({
                    page: number,
                    kind: 'fixed-out-of-page',
                    text: clip(textOf(item.node)) || item.node.type,
                    detail: `${item.box.top.toFixed(1)}–${bottomOf(item.box).toFixed(1)} при высоте листа ${height}`,
                });
            }
        }

        for (const item of content) {
            const { box } = item;
            const text = clip(textOf(item.node));
            if (headerBottom !== null && box.top < headerBottom - EPSILON) {
                issues.push({
                    page: number,
                    kind: 'header-overlap',
                    text,
                    detail: `верх ${box.top.toFixed(1)} выше низа шапки ${headerBottom.toFixed(1)}`,
                });
            }
            if (footerTop !== null && bottomOf(box) > footerTop + EPSILON) {
                issues.push({
                    page: number,
                    kind: 'footer-overlap',
                    text,
                    detail: `низ ${bottomOf(box).toFixed(1)} ниже верха подвала ${footerTop.toFixed(1)}`,
                });
            }
            if (bottomOf(box) > height - paddingBottom + EPSILON || box.top < paddingTop - EPSILON) {
                issues.push({
                    page: number,
                    kind: 'out-of-page',
                    text,
                    detail: `${box.top.toFixed(1)}–${bottomOf(box).toFixed(1)} при полях ${paddingTop}–${(height - paddingBottom).toFixed(1)}`,
                });
            }
        }
        // «Итого» без своей таблицы: страница начинается с итога
        if (content[0] && textOf(content[0].node).startsWith('Итого')) {
            issues.push({
                page: number,
                kind: 'orphan-totals',
                text: clip(textOf(content[0].node)),
                detail: 'итог оторван от таблицы',
            });
        }
        if (lastContent && isHeading(lastContent.node) && index < pageNodes.length - 1) {
            issues.push({
                page: number,
                kind: 'orphan-heading',
                text: clip(textOf(lastContent.node)),
                detail: 'заголовок последний на странице',
            });
        }
    });

    return { pages, issues };
};

export const formatAudit = (name: string, audit: LayoutAudit): string => {
    const lines = [`== ${name}: страниц ${audit.pages.length}`];
    for (const page of audit.pages) {
        const header = page.headerBottom?.toFixed(0) ?? '—';
        const footer = page.footerTop?.toFixed(0) ?? '—';
        const top = page.contentTop?.toFixed(0) ?? '—';
        const bottom = page.contentBottom?.toFixed(0) ?? '—';
        const limit = (page.height - page.paddingBottom).toFixed(0);
        lines.push(
            `  стр. ${page.page}: шапка до ${header} / поле ${page.paddingTop}; текст ${top}–${bottom}; подвал с ${footer} / поле до ${limit}; первый «${page.firstText}», последний «${page.lastText}»`,
        );
    }
    for (const issue of audit.issues) {
        lines.push(`  !! стр. ${issue.page} ${issue.kind}: «${issue.text}» — ${issue.detail}`);
    }
    return lines.join('\n');
};

/** Срез дерева для отладки (--dump): тип, box, fixed, начало текста */
export const dumpTree = (node: LayoutNode, depth = 0): unknown => ({
    type: node.type,
    box:
        node.box &&
        [node.box.top, node.box.left, node.box.width, node.box.height].map(value =>
            Math.round(value),
        ),
    fixed: node.props?.fixed || undefined,
    text:
        node.type === 'TEXT'
            ? (node.lines ?? [])
                  .map(line => line.string)
                  .join(' ')
                  .slice(0, 30)
            : undefined,
    children:
        depth < 3 ? (node.children ?? []).slice(0, 8).map(child => dumpTree(child, depth + 1)) : undefined,
});
