import {
    findTextlessPages,
    isDecoration,
    type LayoutBox,
    type LayoutLine,
    type LayoutNode,
} from '../lib/pdf-layout';

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
    | 'orphan-price-heading'
    | 'orphan-set-title'
    | 'orphan-complect-title'
    | 'orphan-totals'
    | 'text-overlap'
    | 'textless-page'
    | 'glyph-loss';

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
    /** Внутри fixed-оформления (вкладка в поле, всё fixed титульника): в проверки не идёт */
    decor: boolean;
}

const textOf = (node: LayoutNode): string => {
    if (node.type === 'TEXT') {
        return (node.lines ?? [])
            .map(line => line.string)
            .join(' ')
            .trim();
    }
    return (node.children ?? []).map(textOf).filter(Boolean).join(' ').trim();
};

/** Листовые блоки в порядке документа; смещения родителей сложены */
const leaves = (
    node: LayoutNode,
    page: LayoutNode,
    offsetTop = 0,
    offsetLeft = 0,
    fixed = false,
    decor = false,
): Leaf[] => {
    if (!node.box) return [];
    const box: LayoutBox = {
        top: offsetTop + node.box.top,
        left: offsetLeft + node.box.left,
        width: node.box.width,
        height: node.box.height,
    };
    const fixedRoot = !fixed && Boolean(node.props?.fixed);
    const isFixed = fixed || fixedRoot;
    // повёрнутый текст вкладки в раскладке лежит неповёрнутым и вылезает из
    // поля — поэтому украшение определяется по корню, а не по листьям
    const isDecor = decor || (fixedRoot && isDecoration(box, page, node));
    const children = node.children ?? [];
    if (!children.length || node.type === 'TEXT') {
        return [{ node, box, fixed: isFixed, decor: isDecor }];
    }
    return children.flatMap(child =>
        leaves(child, page, box.top, box.left, isFixed, isDecor),
    );
};

const bottomOf = (box: LayoutBox): number => box.top + box.height;

const textNodesOf = (node: LayoutNode): LayoutNode[] =>
    node.type === 'TEXT' ? [node] : (node.children ?? []).flatMap(textNodesOf);

/**
 * Сколько символов строки осталось без глифа. react-pdf режет строку на
 * глифы по символам, закреплённым за каждым глифом; глиф без символов
 * (испорченный кэш шрифта, см. primePdfFontGlyphs) сбивает счёт, и буквы
 * выпадают из печати: «Гарант-Предприятие PRO» → «Гарант-Предприятие O».
 */
const lostChars = (line: LayoutLine): number => {
    const printed = (line.runs ?? [])
        .flatMap(run => run.glyphs ?? [])
        .reduce((sum, glyph) => sum + (glyph.codePoints?.length ?? 0), 0);
    return [...line.string].length - printed;
};

/** Заголовок раздела: кегль заметно крупнее базового */
const isHeading = (node: LayoutNode): boolean =>
    node.type === 'TEXT' && (node.style?.fontSize ?? 0) >= 13;

/**
 * Заголовок набора для сравнения: «Набор 1», «Набор 2» — в таблице цен и на
 * плашке набора в блоке «Наполнение наборов для сравнения»
 */
const SET_TITLE_PATTERN = /^Набор \d+$/;

const isSetTitle = (node: LayoutNode): boolean =>
    node.type === 'TEXT' && SET_TITLE_PATTERN.test(textOf(node));

/**
 * Заголовок комплекта в наполнении по комплектам: «Комплект 1. …». Так
 * названы комплекты в сценариях аудита; название и подпись поставки — один
 * текстовый блок.
 */
const COMPLECT_TITLE_PATTERN = /^Комплект \d+\. /;

const isComplectTitle = (node: LayoutNode): boolean =>
    node.type === 'TEXT' && COMPLECT_TITLE_PATTERN.test(textOf(node));

/**
 * Заголовок раздела цен и подпись колонки в шапке его таблицы. Сравниваются
 * без учёта регистра: стиль может печатать их прописными.
 */
const PRICE_HEADING = 'стоимость';
const PRICE_TABLE_HEAD = 'наименование';

const textIs = (node: LayoutNode, expected: string): boolean =>
    textOf(node).toLowerCase() === expected;

const clip = (text: string): string => text.slice(0, 60);

const EPSILON = 0.5;

/** Два блока перекрываются и по вертикали, и по горизонтали */
const intersects = (a: LayoutBox, b: LayoutBox): boolean =>
    a.left < b.left + b.width - EPSILON &&
    b.left < a.left + a.width - EPSILON &&
    a.top < bottomOf(b) - EPSILON &&
    b.top < bottomOf(a) - EPSILON;

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
        const all = (page.children ?? [])
            .flatMap(child => leaves(child, page))
            .filter(item => !item.decor);
        const fixed = all.filter(item => item.fixed);
        const content = all.filter(item => !item.fixed);
        // шапка — fixed-блоки в верхней половине листа, подвал — в нижней;
        // блок, растянутый через обе половины, уже сломан (fixed-out-of-page)
        const headerBottom = fixed
            .filter(item => bottomOf(item.box) <= height / 2)
            .reduce<
                number | null
            >((max, item) => Math.max(max ?? 0, bottomOf(item.box)), null);
        const footerTop = fixed
            .filter(item => item.box.top >= height / 2)
            .reduce<
                number | null
            >((min, item) => Math.min(min ?? height, item.box.top), null);
        const contentTop = content.length
            ? Math.min(...content.map(item => item.box.top))
            : null;
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
            if (
                item.box.top < -EPSILON ||
                bottomOf(item.box) > height + EPSILON
            ) {
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
            if (
                bottomOf(box) > height - paddingBottom + EPSILON ||
                box.top < paddingTop - EPSILON
            ) {
                issues.push({
                    page: number,
                    kind: 'out-of-page',
                    text,
                    detail: `${box.top.toFixed(1)}–${bottomOf(box).toFixed(1)} при полях ${paddingTop}–${(height - paddingBottom).toFixed(1)}`,
                });
            }
        }
        // текст поверх текста: неразрывный блок выше страницы вылез за свою
        // строку, и следующая строка нарисована на нём (КП 15.11)
        const texts = content.filter(
            item => item.node.type === 'TEXT' && item.box.height > 0,
        );
        texts.forEach((item, at) => {
            const hit = texts
                .slice(at + 1)
                .find(other => intersects(item.box, other.box));
            if (hit) {
                issues.push({
                    page: number,
                    kind: 'text-overlap',
                    text: clip(textOf(item.node)),
                    detail: `накрыт текстом «${clip(textOf(hit.node))}»`,
                });
            }
        });
        // буквы выпали из печати — смотрим весь лист, включая титульник и шапки
        for (const node of textNodesOf(page)) {
            for (const line of node.lines ?? []) {
                const lost = lostChars(line);
                if (lost > 0) {
                    issues.push({
                        page: number,
                        kind: 'glyph-loss',
                        text: clip(line.string),
                        detail: `символов без глифа — ${lost}: буквы выпали из печати`,
                    });
                }
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
        if (
            lastContent &&
            isHeading(lastContent.node) &&
            index < pageNodes.length - 1
        ) {
            issues.push({
                page: number,
                kind: 'orphan-heading',
                text: clip(textOf(lastContent.node)),
                detail: 'заголовок последний на странице',
            });
        }
        // «Стоимость» без своей таблицы: заголовок и подпись под ним остались на
        // листе, а таблица ушла на следующий (КП 27.11.2026). Последней на
        // листе стоит подпись, поэтому orphan-heading этого не видит.
        const priceHeadingAt = content.findIndex(
            item => isHeading(item.node) && textIs(item.node, PRICE_HEADING),
        );
        if (
            priceHeadingAt >= 0 &&
            !content
                .slice(priceHeadingAt + 1)
                .some(item => textIs(item.node, PRICE_TABLE_HEAD))
        ) {
            issues.push({
                page: number,
                kind: 'orphan-price-heading',
                text: clip(textOf(content[priceHeadingAt].node)),
                detail: 'заголовок цен без таблицы: шапка таблицы на другом листе',
            });
        }
        // заголовок набора для сравнения без своей первой строки или, на плашке
        // наполнения, без своего комплекта: ушёл вниз листа один
        if (lastContent && isSetTitle(lastContent.node)) {
            issues.push({
                page: number,
                kind: 'orphan-set-title',
                text: clip(textOf(lastContent.node)),
                detail: 'заголовок набора последний на странице',
            });
        }
        // заголовок комплекта без своей первой группы: ушёл вниз листа один
        if (lastContent && isComplectTitle(lastContent.node)) {
            issues.push({
                page: number,
                kind: 'orphan-complect-title',
                text: clip(textOf(lastContent.node)),
                detail: 'заголовок комплекта последний на странице',
            });
        }
    });

    // лист без текста: хвост карточки с нижним полем, не влезшим на предыдущий лист
    for (const tail of findTextlessPages(root)) {
        issues.push({
            page: tail.page,
            kind: 'textless-page',
            text: '',
            detail: `на листе нет текста, только пустые блоки ${tail.top.toFixed(1)}–${tail.bottom.toFixed(1)}; запас на предыдущем листе ${tail.slack.toFixed(1)}`,
        });
    }

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
        lines.push(
            `  !! стр. ${issue.page} ${issue.kind}: «${issue.text}» — ${issue.detail}`,
        );
    }
    return lines.join('\n');
};

/** Срез дерева для отладки (--dump): тип, box, fixed, начало текста */
export const dumpTree = (node: LayoutNode, depth = 0): unknown => ({
    type: node.type,
    box:
        node.box &&
        [node.box.top, node.box.left, node.box.width, node.box.height].map(
            value => Math.round(value),
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
        depth < 3
            ? (node.children ?? [])
                  .slice(0, 8)
                  .map(child => dumpTree(child, depth + 1))
            : undefined,
});
