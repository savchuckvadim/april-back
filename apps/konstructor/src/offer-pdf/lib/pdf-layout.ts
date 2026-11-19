import type { ReactElement } from 'react';
import { pdf, type DocumentProps } from '@react-pdf/renderer';

/**
 * Раскладка react-pdf как данные. Движок сам меряет текст метриками шрифта
 * и режет страницы; здесь — доступ к результату этого расчёта, чтобы
 * подогнать то, чего Yoga не считает: поля под шапку и подвал (fixed-блоки
 * не раздвигают текст) и проверки «не уехало ли».
 */

export interface LayoutBox {
    top: number;
    left: number;
    width: number;
    height: number;
}

export interface LayoutNode {
    type: string;
    /** Координаты относительно родителя */
    box?: LayoutBox;
    props?: { fixed?: boolean; wrap?: boolean; minPresenceAhead?: number };
    style?: {
        paddingTop?: number;
        paddingBottom?: number;
        paddingLeft?: number;
        paddingRight?: number;
        fontSize?: number;
    };
    children?: LayoutNode[];
    lines?: Array<{ string: string }>;
}

/** Поля страницы под шапку и подвал; шаблон кладёт их поверх своих */
export interface OfferPdfPageFrame {
    paddingTop: number;
    paddingBottom: number;
    /**
     * Нижнее поле карточек разделов вместо поля темы. Включается перерисовкой,
     * когда нижнее поле карточки не поместилось на листе и ушло на следующий
     * один (findTextlessPages): без него хвост карточки печатается пустым листом.
     */
    surfaceBottom?: number;
}

export interface PdfRender {
    buffer: Buffer;
    layout: LayoutNode;
}

interface PdfInstance {
    container: { document: { props: Record<string, unknown> } | null };
    toBuffer: () => Promise<NodeJS.ReadableStream>;
}

interface RenderParams {
    _INTERNAL__LAYOUT__DATA_?: LayoutNode;
}

const streamToBuffer = (stream: NodeJS.ReadableStream): Promise<Buffer> =>
    new Promise((done, fail) => {
        const chunks: Buffer[] = [];
        stream.on('data', (chunk: Buffer | Uint8Array) =>
            chunks.push(Buffer.from(chunk)),
        );
        stream.on('end', () => done(Buffer.concat(chunks)));
        stream.on('error', fail);
    });

/**
 * Рендер с деревом раскладки. onRender react-pdf читает с props самого
 * <Document>; шаблон отдаёт компонент-обёртку, поэтому колбэк вешается на
 * уже смонтированный документ.
 */
export const renderPdfWithLayout = async (
    element: ReactElement<DocumentProps>,
): Promise<PdfRender> => {
    let layout: LayoutNode | null = null;
    const instance = pdf(element) as unknown as PdfInstance;
    const document = instance.container.document;
    if (!document) throw new Error('react-pdf не смонтировал документ');
    document.props = {
        ...document.props,
        onRender: (params: RenderParams) => {
            layout = params._INTERNAL__LAYOUT__DATA_ ?? null;
        },
    };
    const buffer = await streamToBuffer(await instance.toBuffer());
    if (!layout) throw new Error('react-pdf не отдал раскладку');
    return { buffer, layout };
};

export const pageNodesOf = (root: LayoutNode): LayoutNode[] =>
    (root.children ?? []).flatMap(node =>
        node.type === 'PAGE' ? [node] : (node.children ?? []),
    );

interface FixedBlock {
    box: LayoutBox;
    node: LayoutNode;
}

const fixedExtent = (node: LayoutNode, offsetTop: number): FixedBlock[] => {
    if (!node.box) return [];
    const top = offsetTop + node.box.top;
    if (node.props?.fixed) return [{ box: { ...node.box, top }, node }];
    return (node.children ?? []).flatMap(child => fixedExtent(child, top));
};

export interface PageChrome {
    pageHeight: number;
    paddingTop: number;
    paddingBottom: number;
    /** Низ самого нижнего fixed-блока верхней половины листа */
    headerBottom: number | null;
    /** Верх самого верхнего fixed-блока нижней половины листа */
    footerTop: number | null;
}

const SIDE_EPSILON = 0.5;

/**
 * Fixed-блок целиком в боковом поле листа — украшение (вкладка у края,
 * полосы подложки), а не шапка и не подвал: поля под него не растут.
 */
export const isSideDecoration = (box: LayoutBox, page: LayoutNode): boolean => {
    const width = page.box?.width ?? 0;
    const left = page.style?.paddingLeft ?? 0;
    const right = page.style?.paddingRight ?? 0;
    const inLeft = box.left + box.width <= left + SIDE_EPSILON;
    const inRight = box.left >= width - right - SIDE_EPSILON;
    return (left > 0 && inLeft) || (right > 0 && inRight);
};

/** Лист без полей — титульник: стиль раскладывает его сам, шапки и подвала нет */
const isBareSheet = ({ style }: LayoutNode): boolean =>
    !style?.paddingTop &&
    !style?.paddingBottom &&
    !style?.paddingLeft &&
    !style?.paddingRight;

/**
 * Fixed-блок — оформление листа: в боковом поле, на титульнике или
 * картинка (фон, угловое пятно — шапки и подвалы собираются из View).
 */
export const isDecoration = (
    box: LayoutBox,
    page: LayoutNode,
    node?: LayoutNode,
): boolean =>
    node?.type === 'IMAGE' || isBareSheet(page) || isSideDecoration(box, page);

const chromeOf = (page: LayoutNode): PageChrome | null => {
    if (!page.box) return null;
    const pageHeight = page.box.height;
    const fixed = (page.children ?? [])
        .flatMap(child => fixedExtent(child, 0))
        .filter(block => !isDecoration(block.box, page, block.node))
        .map(block => block.box);
    // подложка во всю высоту листа не шапка и не подвал: обе проверки её отсекают
    const headers = fixed.filter(box => box.top + box.height <= pageHeight / 2);
    const footers = fixed.filter(box => box.top >= pageHeight / 2);
    return {
        pageHeight,
        paddingTop: page.style?.paddingTop ?? 0,
        paddingBottom: page.style?.paddingBottom ?? 0,
        headerBottom: headers.length
            ? Math.max(...headers.map(box => box.top + box.height))
            : null,
        footerTop: footers.length
            ? Math.min(...footers.map(box => box.top))
            : null,
    };
};

/**
 * Шапка и подвал по fixed-блокам первой страницы, где они есть: титульник
 * идёт отдельной страницей без шапки и подвала, его поля не в счёт.
 */
export const measurePageChrome = (layout: LayoutNode): PageChrome | null => {
    const chromes = pageNodesOf(layout)
        .map(chromeOf)
        .filter((chrome): chrome is PageChrome => chrome !== null);
    return (
        chromes.find(
            chrome => chrome.headerBottom !== null || chrome.footerTop !== null,
        ) ??
        chromes[0] ??
        null
    );
};

/** Воздух между шапкой/подвалом и текстом */
export const PAGE_FRAME_GAP = 8;

/**
 * Поля, при которых текст не заходит на шапку и подвал. null — текущие
 * поля уже подходят, перерисовывать не нужно. Поля только растут: шаблон
 * задаёт минимум, длинные реквизиты или контакты менеджера его раздвигают.
 */
export const fitPageFrame = (layout: LayoutNode): OfferPdfPageFrame | null => {
    const chrome = measurePageChrome(layout);
    if (!chrome) return null;
    const paddingTop =
        chrome.headerBottom === null
            ? chrome.paddingTop
            : Math.max(
                  chrome.paddingTop,
                  Math.ceil(chrome.headerBottom + PAGE_FRAME_GAP),
              );
    const paddingBottom =
        chrome.footerTop === null
            ? chrome.paddingBottom
            : Math.max(
                  chrome.paddingBottom,
                  Math.ceil(
                      chrome.pageHeight - chrome.footerTop + PAGE_FRAME_GAP,
                  ),
              );
    if (
        paddingTop === chrome.paddingTop &&
        paddingBottom === chrome.paddingBottom
    ) {
        return null;
    }
    return { paddingTop, paddingBottom };
};

/** Есть ли в узле видимый текст */
const hasText = (node: LayoutNode): boolean =>
    node.type === 'TEXT'
        ? (node.lines ?? []).some(line => line.string.trim() !== '')
        : (node.children ?? []).some(hasText);

interface BodyLeaf {
    node: LayoutNode;
    top: number;
    bottom: number;
}

/** Листовые блоки вне fixed-блоков (шапка, подвал и оформление не в счёт), в координатах листа */
const bodyLeaves = (node: LayoutNode, offsetTop = 0): BodyLeaf[] => {
    if (!node.box || node.props?.fixed) return [];
    const top = offsetTop + node.box.top;
    const children = node.children ?? [];
    if (!children.length || node.type === 'TEXT') {
        return [{ node, top, bottom: top + node.box.height }];
    }
    return children.flatMap(child => bodyLeaves(child, top));
};

/** Лист, на котором нет текста: в раскладке лежат только пустые блоки */
export interface TextlessPage {
    /** Номер листа с единицы */
    page: number;
    top: number;
    bottom: number;
    /**
     * Запас на предыдущем листе между низом его содержимого и нижним полем.
     * Нижнее поле карточки не больше этого запаса помещается там же и на
     * новый лист не уходит.
     */
    slack: number;
}

/**
 * Листы без текста. react-pdf делит карточку по высоте с нижним полем: если
 * текст внутри уместился, а поле нет, поле уезжает на следующий лист одно, и
 * в документе появляется пустой лист с хвостом карточки. Титульник (лист без
 * полей) пропускается.
 */
export const findTextlessPages = (layout: LayoutNode): TextlessPage[] => {
    const pages = pageNodesOf(layout);
    return pages.flatMap((page, index) => {
        if (isBareSheet(page)) return [];
        const leaves = (page.children ?? []).flatMap(child =>
            bodyLeaves(child),
        );
        if (!leaves.length || leaves.some(leaf => hasText(leaf.node))) {
            return [];
        }
        const previous = pages[index - 1];
        const previousBottom = previous
            ? Math.max(
                  0,
                  ...(previous.children ?? [])
                      .flatMap(child => bodyLeaves(child))
                      .map(leaf => leaf.bottom),
              )
            : 0;
        const limit =
            (previous?.box?.height ?? 0) -
            (previous?.style?.paddingBottom ?? 0);
        return [
            {
                page: index + 1,
                top: Math.min(...leaves.map(leaf => leaf.top)),
                bottom: Math.max(...leaves.map(leaf => leaf.bottom)),
                slack: previous ? Math.max(0, limit - previousBottom) : 0,
            },
        ];
    });
};
