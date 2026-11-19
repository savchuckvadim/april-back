jest.mock('@react-pdf/renderer', () =>
    jest
        .requireActual<
            typeof import('./helpers/react-pdf.mock')
        >('./helpers/react-pdf.mock')
        .createReactPdfMock(),
);

import {
    findTextlessPages,
    fitPageFrame,
    measurePageChrome,
    PAGE_FRAME_GAP,
    type LayoutNode,
} from '../lib/pdf-layout';
import {
    surfaceStyles,
    withSurfaceBottom,
} from '../templates/kit/document/surface.styles';
import { PEARL_THEME } from '../templates/pearl/pearl.theme';
import { CLASSIC_THEME } from '../templates/classic/classic.theme';

/**
 * Поля страницы под шапку и подвал: react-pdf не раздвигает текст под
 * fixed-блоки, поэтому поля подбираются по измеренной раскладке.
 */
const page = (
    headerHeight: number,
    footerHeight: number,
    paddingTop = 92,
    paddingBottom = 86,
): LayoutNode => ({
    type: 'DOCUMENT',
    children: [
        {
            type: 'PAGE',
            box: { top: 0, left: 0, width: 595, height: 842 },
            style: { paddingTop, paddingBottom },
            children: [
                {
                    type: 'VIEW',
                    props: { fixed: true },
                    box: {
                        top: 26,
                        left: 44,
                        width: 507,
                        height: headerHeight,
                    },
                    children: [
                        {
                            type: 'TEXT',
                            box: { top: 0, left: 0, width: 100, height: 12 },
                        },
                    ],
                },
                {
                    type: 'VIEW',
                    box: { top: paddingTop, left: 44, width: 507, height: 300 },
                },
                {
                    type: 'VIEW',
                    props: { fixed: true },
                    box: {
                        top: 842 - 26 - footerHeight,
                        left: 44,
                        width: 507,
                        height: footerHeight,
                    },
                },
            ],
        },
    ],
});

describe('поля страницы под шапку и подвал', () => {
    it('меряет низ шапки и верх подвала первой страницы', () => {
        const chrome = measurePageChrome(page(62, 54));
        expect(chrome).toEqual({
            pageHeight: 842,
            paddingTop: 92,
            paddingBottom: 86,
            headerBottom: 88,
            footerTop: 762,
        });
    });

    it('шапка и подвал помещаются в поля шаблона — перерисовка не нужна', () => {
        expect(fitPageFrame(page(55, 48))).toBeNull();
    });

    it('длинная шапка раздвигает верхнее поле, подвал — нижнее', () => {
        expect(fitPageFrame(page(80, 48))).toEqual({
            paddingTop: Math.ceil(26 + 80 + PAGE_FRAME_GAP),
            paddingBottom: 86,
        });
        expect(fitPageFrame(page(55, 70))).toEqual({
            paddingTop: 92,
            paddingBottom: Math.ceil(26 + 70 + PAGE_FRAME_GAP),
        });
    });

    it('поля только растут: короткая шапка не сужает поле шаблона', () => {
        expect(fitPageFrame(page(20, 10))).toBeNull();
    });

    it('титульник без шапки и подвала пропускается — поля по первой странице с ними', () => {
        const withCover: LayoutNode = {
            type: 'DOCUMENT',
            children: [
                {
                    type: 'PAGE',
                    box: { top: 0, left: 0, width: 595, height: 842 },
                    style: { paddingTop: 0, paddingBottom: 0 },
                    children: [
                        {
                            type: 'VIEW',
                            box: { top: 120, left: 52, width: 300, height: 90 },
                        },
                    ],
                },
                ...(page(80, 48).children ?? []),
            ],
        };
        expect(fitPageFrame(withCover)).toEqual(fitPageFrame(page(80, 48)));
    });

    it('fixed на титульнике (вкладка у края) — оформление, поля по нему не подбираются', () => {
        const [content] = page(80, 48).children ?? [];
        const withTab: LayoutNode = {
            type: 'DOCUMENT',
            children: [
                {
                    type: 'PAGE',
                    box: { top: 0, left: 0, width: 595, height: 842 },
                    style: {},
                    children: [
                        {
                            type: 'VIEW',
                            props: { fixed: true },
                            box: { top: 96, left: 573, width: 22, height: 170 },
                        },
                    ],
                },
                ...(content ? [content] : []),
            ],
        };
        expect(fitPageFrame(withTab)).toEqual(fitPageFrame(page(80, 48)));
    });

    it('fixed-картинка (угловое пятно) — оформление, поля под неё не растут', () => {
        const [content] = page(55, 48).children ?? [];
        const corner: LayoutNode = {
            type: 'IMAGE',
            props: { fixed: true },
            box: { top: 0, left: 365, width: 230, height: 123 },
        };
        const withCorner: LayoutNode = {
            type: 'DOCUMENT',
            children: content
                ? [
                      {
                          ...content,
                          children: [...(content.children ?? []), corner],
                      },
                  ]
                : [],
        };
        expect(measurePageChrome(withCorner)?.headerBottom).toBe(26 + 55);
        expect(fitPageFrame(withCorner)).toBeNull();
    });

    it('fixed в боковом поле не шапка: вкладка справа поля не раздвигает', () => {
        const [content] = page(55, 48).children ?? [];
        const sideTab: LayoutNode = {
            type: 'VIEW',
            props: { fixed: true },
            box: { top: 96, left: 573, width: 22, height: 170 },
        };
        const withSideTab: LayoutNode = {
            type: 'DOCUMENT',
            children: content
                ? [
                      {
                          ...content,
                          style: {
                              ...content.style,
                              paddingLeft: 44,
                              paddingRight: 44,
                          },
                          children: [...(content.children ?? []), sideTab],
                      },
                  ]
                : [],
        };
        expect(measurePageChrome(withSideTab)?.headerBottom).toBe(26 + 55);
        expect(fitPageFrame(withSideTab)).toBeNull();
    });

    it('без страниц — ничего не меряет', () => {
        expect(
            measurePageChrome({ type: 'DOCUMENT', children: [] }),
        ).toBeNull();
        expect(fitPageFrame({ type: 'DOCUMENT', children: [] })).toBeNull();
    });
});

/**
 * Хвост карточки: текст уместился на лист, а нижнее поле карточки нет и ушло
 * на следующий лист одно — в документе лист без текста.
 */
describe('листы без текста', () => {
    const text = (top: number, height: number): LayoutNode => ({
        type: 'TEXT',
        box: { top, left: 0, width: 400, height },
        lines: [{ string: 'Сумма прописью' }],
    });
    const sheet = (
        children: LayoutNode[],
        padding: { top?: number; bottom?: number } = { top: 92, bottom: 66 },
    ): LayoutNode => ({
        type: 'PAGE',
        box: { top: 0, left: 0, width: 595, height: 842 },
        style: { paddingTop: padding.top, paddingBottom: padding.bottom },
        children,
    });
    const card = (top: number, height: number, ...rest: LayoutNode[]) => ({
        type: 'VIEW',
        box: { top, left: 44, width: 507, height },
        children: rest,
    });
    const header: LayoutNode = {
        type: 'VIEW',
        props: { fixed: true },
        box: { top: 26, left: 44, width: 507, height: 40 },
        children: [text(0, 12)],
    };
    const document = (...pages: LayoutNode[]): LayoutNode => ({
        type: 'DOCUMENT',
        children: pages,
    });

    it('находит лист с одним пустым хвостом карточки и запас предыдущего листа', () => {
        const full = sheet([
            header,
            card(92, 684, { ...card(0, 680, text(0, 680)) }),
        ]);
        const tail = sheet([header, card(92, 15)]);
        expect(findTextlessPages(document(full, tail))).toEqual([
            { page: 2, top: 92, bottom: 107, slack: 4 },
        ]);
    });

    it('лист с текстом, титульник без полей и лист из одних fixed-блоков не считаются', () => {
        const withText = sheet([header, card(92, 200, text(0, 20))]);
        const cover = sheet([card(0, 842)], {});
        const fixedOnly = sheet([header]);
        expect(findTextlessPages(document(cover, withText, fixedOnly))).toEqual(
            [],
        );
    });

    it('текст в fixed-блоках (шапка, подвал) листом с текстом не делает', () => {
        const tail = sheet([header, card(92, 15)]);
        expect(findTextlessPages(document(tail))).toHaveLength(1);
    });
});

describe('нижнее поле карточек', () => {
    it('без значения тема остаётся той же, без карточек тоже', () => {
        expect(withSurfaceBottom(PEARL_THEME, undefined)).toBe(PEARL_THEME);
        expect(withSurfaceBottom(CLASSIC_THEME, 0)).toBe(CLASSIC_THEME);
    });

    it('со значением карточка получает своё нижнее поле, остальные поля темы', () => {
        const trimmed = withSurfaceBottom(PEARL_THEME, 3);
        expect(trimmed.surface?.bottomPadding).toBe(3);
        expect(trimmed.surface?.padding).toBe(PEARL_THEME.surface?.padding);
        const card = surfaceStyles(trimmed).card;
        expect(card).toMatchObject({
            padding: PEARL_THEME.surface?.padding,
            paddingBottom: 3,
        });
        // стиль обычной карточки нижнего поля не задаёт
        expect(surfaceStyles(PEARL_THEME).card).not.toHaveProperty(
            'paddingBottom',
        );
    });
});
