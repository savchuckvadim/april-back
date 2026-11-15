jest.mock('@react-pdf/renderer', () =>
    jest
        .requireActual<
            typeof import('./helpers/react-pdf.mock')
        >('./helpers/react-pdf.mock')
        .createReactPdfMock(),
);

import {
    fitPageFrame,
    measurePageChrome,
    PAGE_FRAME_GAP,
    type LayoutNode,
} from '../lib/pdf-layout';

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
