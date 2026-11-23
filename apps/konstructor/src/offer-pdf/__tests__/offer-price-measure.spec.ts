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
import { CLASSIC_THEME } from '../templates/classic/classic.theme';
import { OfferPrice } from '../templates/kit/price/OfferPrice';
import {
    priceColumns,
    priceRowValues,
} from '../templates/kit/price/price-columns.util';
import { priceStyles } from '../templates/kit/price/price.styles';
import {
    createOfferPdfModelFixture,
    createOfferRenderDataFixture,
} from './fixtures/offer-pdf-model.fixture';
import { collectTexts } from './helpers/react-pdf.mock';

interface HostProps {
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

const [firstRow] = createOfferRenderDataFixture().ProductRows;

/** Строка лицензии: короткая единица в «Ед.», длинная мера портала в подписи */
const licenseRow: IProductRenderItemData = {
    ...firstRow,
    ProductName: 'Гарант-Офис',
    ProductMeasure: 'шт.',
    ProductMeasureCaption: 'Лицензия 6 месяцев',
    SupplyNameMarketing: 'Интернет-версия на 3 одновременных доступа',
    ProductDiscountPercent: '0',
};

const priceElement = (rows: IProductRenderItemData[]): ReactElement =>
    createElement(OfferPrice, {
        model: createOfferPdfModelFixture({
            data: createOfferRenderDataFixture({
                ProductRows: rows,
                TotalRow: undefined,
            }),
        }),
        theme: CLASSIC_THEME,
    });

/** Тексты мелких подписей под названием (стиль `sub`), в порядке строки */
const subTexts = (rows: IProductRenderItemData[]): string[] =>
    hostElements(priceElement(rows))
        .filter(
            element => element.props.style === priceStyles(CLASSIC_THEME).sub,
        )
        .flatMap(element => collectTexts(element));

describe('таблица цен PDF-КП: единица измерения', () => {
    it('колонка «Ед.» печатает короткую единицу', () => {
        const columns = priceColumns(false).map(column => column.title);
        const values = priceRowValues(licenseRow, 0, false);

        expect(values[columns.indexOf('Ед.')]).toBe('шт.');
    });

    it('длинная мера портала — мелкой подписью в названии, после подписи поставки', () => {
        expect(subTexts([licenseRow])).toEqual([
            'Интернет-версия на 3 одновременных доступа',
            'Лицензия 6 месяцев',
        ]);
    });

    it('подпись меры и название — в одной ячейке названия', () => {
        const texts = collectTexts(priceElement([licenseRow]));

        expect(texts).toContain('Лицензия 6 месяцев');
        expect(texts.indexOf('Лицензия 6 месяцев')).toBeGreaterThan(
            texts.indexOf('Гарант-Офис'),
        );
        // единица в колонке «Ед.» стоит отдельной ячейкой, а не в подписи
        expect(texts).toContain('шт.');
    });

    it('без подписи меры (сервисный договор, короткая мера) лишних строк нет', () => {
        const service: IProductRenderItemData = {
            ...licenseRow,
            ProductMeasure: 'мес.',
            ProductMeasureCaption: '',
        };

        expect(subTexts([service])).toEqual([
            'Интернет-версия на 3 одновременных доступа',
        ]);
        expect(collectTexts(priceElement([service]))).not.toContain(
            'Лицензия 6 месяцев',
        );
    });

    it('данные без поля подписи (старые) печатаются как раньше', () => {
        const legacy: Partial<IProductRenderItemData> = { ...licenseRow };
        delete legacy.ProductMeasureCaption;

        expect(subTexts([legacy as IProductRenderItemData])).toEqual([
            'Интернет-версия на 3 одновременных доступа',
        ]);
    });

    it('подпись меры печатается и без подписи поставки', () => {
        expect(subTexts([{ ...licenseRow, SupplyNameMarketing: '' }])).toEqual([
            'Лицензия 6 месяцев',
        ]);
    });
});
