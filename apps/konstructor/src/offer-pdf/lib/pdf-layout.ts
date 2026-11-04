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
    style?: { paddingTop?: number; paddingBottom?: number; fontSize?: number };
    children?: LayoutNode[];
    lines?: Array<{ string: string }>;
}

/** Поля страницы под шапку и подвал; шаблон кладёт их поверх своих */
export interface OfferPdfPageFrame {
    paddingTop: number;
    paddingBottom: number;
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

const fixedExtent = (node: LayoutNode, offsetTop: number): LayoutBox[] => {
    if (!node.box) return [];
    const top = offsetTop + node.box.top;
    if (node.props?.fixed) return [{ ...node.box, top }];
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

/** Шапка и подвал первой страницы по fixed-блокам */
export const measurePageChrome = (layout: LayoutNode): PageChrome | null => {
    const page = pageNodesOf(layout)[0];
    if (!page?.box) return null;
    const pageHeight = page.box.height;
    const fixed = (page.children ?? []).flatMap(child => fixedExtent(child, 0));
    const headers = fixed.filter(box => box.top + box.height <= pageHeight / 2);
    const footers = fixed.filter(box => box.top >= pageHeight / 2);
    return {
        pageHeight,
        paddingTop: page.style?.paddingTop ?? 0,
        paddingBottom: page.style?.paddingBottom ?? 0,
        headerBottom: headers.length
            ? Math.max(...headers.map(box => box.top + box.height))
            : null,
        footerTop: footers.length ? Math.min(...footers.map(box => box.top)) : null,
    };
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
            : Math.max(chrome.paddingTop, Math.ceil(chrome.headerBottom + PAGE_FRAME_GAP));
    const paddingBottom =
        chrome.footerTop === null
            ? chrome.paddingBottom
            : Math.max(
                  chrome.paddingBottom,
                  Math.ceil(chrome.pageHeight - chrome.footerTop + PAGE_FRAME_GAP),
              );
    if (paddingTop === chrome.paddingTop && paddingBottom === chrome.paddingBottom) {
        return null;
    }
    return { paddingTop, paddingBottom };
};
