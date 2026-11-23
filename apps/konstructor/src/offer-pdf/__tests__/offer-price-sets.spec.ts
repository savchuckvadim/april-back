jest.mock('@react-pdf/renderer', () =>
    jest
        .requireActual<
            typeof import('./helpers/react-pdf.mock')
        >('./helpers/react-pdf.mock')
        .createReactPdfMock(),
);

import {
    createElement,
    isValidElement,
    type ReactElement,
    type ReactNode,
} from 'react';
import { IProductRenderItemData } from '@app/konstructor/offer-word/services/render-data-services/offer-render-price.service';
import { OFFER_PDF_DEFAULT_SETTINGS } from '../model/offer-pdf-settings';
import { CLASSIC_THEME } from '../templates/classic/classic.theme';
import { PEARL_THEME } from '../templates/pearl/pearl.theme';
import { OfferPrice } from '../templates/kit/price/OfferPrice';
import { priceStyles } from '../templates/kit/price/price.styles';
import type { OfferPdfTheme } from '../templates/kit/theme/offer-pdf-theme';
import {
    createOfferPdfModelFixture,
    createOfferRenderDataFixture,
    productRowsWithSets,
} from './fixtures/offer-pdf-model.fixture';
import { collectTexts } from './helpers/react-pdf.mock';

interface HostProps {
    wrap?: boolean;
    break?: boolean;
    minPresenceAhead?: number;
    style?: unknown;
    children?: ReactNode;
}

/** Все элементы-примитивы дерева; функции-компоненты вызываются как функции. */
const hostElements = (node: ReactNode): Array<ReactElement<HostProps>> => {
    if (Array.isArray(node)) return node.flatMap(hostElements);
    if (!isValidElement<HostProps>(node)) return [];
    if (typeof node.type === 'function') {
        const component = node.type as (props: HostProps) => ReactNode;
        return hostElements(component(node.props));
    }
    return [node, ...hostElements(node.props.children)];
};

const textsOf = (element: ReactElement<HostProps>): string[] =>
    collectTexts(element);

const base = createOfferRenderDataFixture().ProductRows;

const named = (name: string): IProductRenderItemData => ({
    ...base[0],
    ProductName: name,
});

/** Общий набор из двух строк и два набора для сравнения по две строки. */
const withSets = productRowsWithSets(
    [named('Общая А'), named('Общая Б')],
    [
        [named('Первый А'), named('Первый Б')],
        [named('Второй А'), named('Второй Б')],
    ],
);

/** Раздел «Стоимость» на этих строках; «Итого» при наборах для сравнения скрыто */
const priceElement = (
    rows: IProductRenderItemData[],
    theme: OfferPdfTheme,
): ReactElement =>
    createElement(OfferPrice, {
        model: createOfferPdfModelFixture({
            settings: { ...OFFER_PDF_DEFAULT_SETTINGS },
            data: createOfferRenderDataFixture({
                ProductRows: rows,
                TotalRow: undefined,
            }),
        }),
        theme,
    });

const renderPrice = (
    rows: IProductRenderItemData[],
    theme: OfferPdfTheme = CLASSIC_THEME,
): ReactElement<HostProps>[] => hostElements(priceElement(rows, theme));

const textsOfPrice = (rows: IProductRenderItemData[]): string[] =>
    collectTexts(priceElement(rows, CLASSIC_THEME));

/** Неделимые блоки, в которых печатается заголовок набора */
const blocksWithTitle = (
    elements: Array<ReactElement<HostProps>>,
    title: string,
): Array<ReactElement<HostProps>> =>
    elements.filter(
        element =>
            element.props.wrap === false && textsOf(element).includes(title),
    );

describe('таблица цен PDF-КП: заголовки наборов для сравнения', () => {
    it('перед первой строкой каждого набора для сравнения — заголовок «Набор N»', () => {
        const texts = textsOfPrice(withSets);

        expect(texts.filter(text => /^Набор \d+$/.test(text))).toEqual([
            'Набор 1',
            'Набор 2',
        ]);
        expect(texts.indexOf('Набор 1')).toBeGreaterThan(
            texts.indexOf('Общая Б'),
        );
        expect(texts.indexOf('Набор 1')).toBeLessThan(
            texts.indexOf('Первый А'),
        );
        expect(texts.indexOf('Набор 2')).toBeGreaterThan(
            texts.indexOf('Первый Б'),
        );
        expect(texts.indexOf('Набор 2')).toBeLessThan(
            texts.indexOf('Второй А'),
        );
    });

    it('семь наборов по одной строке: семь заголовков', () => {
        const rows = productRowsWithSets(
            [named('Общая А'), named('Общая Б')],
            Array.from({ length: 7 }, (_, index) => [
                named(`Вариант ${index + 1}`),
            ]),
        );
        const titles = textsOfPrice(rows).filter(text =>
            /^Набор \d+$/.test(text),
        );

        expect(titles).toEqual(
            Array.from({ length: 7 }, (_, index) => `Набор ${index + 1}`),
        );
    });

    it('без наборов для сравнения заголовков нет', () => {
        expect(textsOfPrice(base)).not.toContain('Набор 1');
        expect(textsOfPrice(base).some(text => /^Набор \d+$/.test(text))).toBe(
            false,
        );
    });

    it('строки без признаков набора (старые данные) печатаются как раньше', () => {
        const legacy = base.map(row => {
            const rest: Partial<IProductRenderItemData> = { ...row };
            delete rest.ProductSetKind;
            delete rest.ProductSetNumber;
            delete rest.ProductSetTitle;
            delete rest.IsSetFirstRow;
            return rest as IProductRenderItemData;
        });

        expect(textsOfPrice(legacy)).toEqual(textsOfPrice(base));
    });

    it('заголовок и первая строка набора — один небольшой неделимый блок', () => {
        const elements = renderPrice(withSets);
        const [first] = blocksWithTitle(elements, 'Набор 1');
        const [second] = blocksWithTitle(elements, 'Набор 2');

        expect(blocksWithTitle(elements, 'Набор 1')).toHaveLength(1);
        expect(blocksWithTitle(elements, 'Набор 2')).toHaveLength(1);

        const firstTexts = textsOf(first);
        expect(firstTexts).toContain('Первый А');
        expect(firstTexts).not.toContain('Первый Б');
        expect(firstTexts).not.toContain('Набор 2');

        const secondTexts = textsOf(second);
        expect(secondTexts).toContain('Второй А');
        expect(secondTexts).not.toContain('Второй Б');
        expect(secondTexts).not.toContain('Набор 1');
    });

    it('набор из одной строки: блок из заголовка и этой строки', () => {
        // четыре строки: таблица длиннее малой (малая целиком неделима)
        const rows = productRowsWithSets(
            [named('Общая А'), named('Общая Б'), named('Общая В')],
            [[named('Единственная')]],
        );
        const blocks = blocksWithTitle(renderPrice(rows), 'Набор 1');

        expect(blocks).toHaveLength(1);
        expect(textsOf(blocks[0])).toContain('Единственная');
        expect(textsOf(blocks[0])).not.toContain('Общая В');
    });

    it('малая таблица (до трёх строк) с набором целиком неделима, как и без наборов', () => {
        const rows = productRowsWithSets(
            [named('Общая А')],
            [[named('Единственная')]],
        );
        const table = renderPrice(rows).find(
            element => element.props.style === priceStyles(CLASSIC_THEME).table,
        );

        expect(table?.props.wrap).toBe(false);
        expect(textsOf(table as ReactElement<HostProps>)).toContain('Набор 1');
    });

    it('набор в начале таблицы: шапка, заголовок и первая строка — в одном блоке', () => {
        const rows = productRowsWithSets(
            [],
            ['Первый А', 'Второй А', 'Третий А', 'Четвёртый А'].map(name => [
                named(name),
            ]),
        );
        const blocks = blocksWithTitle(renderPrice(rows), 'Набор 1');

        expect(blocks).toHaveLength(1);
        const texts = textsOf(blocks[0]);
        expect(texts).not.toContain('Второй А');
        expect(texts).toContain('Наименование');
        expect(texts.indexOf('Набор 1')).toBeGreaterThan(
            texts.indexOf('Наименование'),
        );
        expect(texts.indexOf('Набор 1')).toBeLessThan(
            texts.indexOf('Первый А'),
        );
    });

    it('неделимые блоки малы — не больше одной строки товара; свойство break не используется, таблица разрываема', () => {
        const elements = renderPrice(withSets);
        const names = [
            'Общая А',
            'Общая Б',
            'Первый А',
            'Первый Б',
            'Второй А',
            'Второй Б',
        ];

        expect(elements.some(element => 'break' in element.props)).toBe(false);
        for (const element of elements.filter(
            candidate => candidate.props.wrap === false,
        )) {
            const texts = textsOf(element);
            expect(
                names.filter(name => texts.includes(name)).length,
            ).toBeLessThanOrEqual(1);
        }
        const table = elements.find(
            element => element.props.style === priceStyles(CLASSIC_THEME).table,
        );
        expect(table?.props.wrap).toBe(true);
    });

    it('строка-заголовок: во всю ширину таблицы и заливкой шапки из темы', () => {
        for (const theme of [CLASSIC_THEME, PEARL_THEME]) {
            const styles = priceStyles(theme);
            const [block] = blocksWithTitle(
                renderPrice(withSets, theme),
                'Набор 1',
            );
            const titleRow = hostElements(block.props.children).find(
                element =>
                    Array.isArray(element.props.style) &&
                    element.props.style.includes(styles.rowSetTitle),
            );

            expect(titleRow).toBeDefined();
            expect(styles.rowSetTitle).toEqual({
                backgroundColor: theme.colors.shade,
            });
            expect(textsOf(titleRow as ReactElement<HostProps>)).toEqual([
                'Набор 1',
            ]);
            // единственная ячейка строки занимает всю ширину
            const cells = hostElements(titleRow?.props.children).filter(
                element =>
                    Array.isArray(element.props.style) &&
                    element.props.style.some(
                        (style: unknown) =>
                            typeof style === 'object' &&
                            style !== null &&
                            'width' in style &&
                            style.width === '100%',
                    ),
            );
            expect(cells).toHaveLength(1);
        }
    });

    it('текст заголовка набора — жирный, слева, кеглем таблицы', () => {
        const styles = priceStyles(CLASSIC_THEME);

        expect(styles.cellSetTitle).toEqual({
            fontSize: CLASSIC_THEME.sizes.sm,
            fontWeight: 'bold',
            textAlign: 'left',
        });
    });
});
