import { ProductRowDto } from '@app/konstructor/document-generate/dto/product-row/product-row.dto';
import { DocumentProductRowService } from '@app/konstructor/document-generate/product-rows/product-row.service';
import { DocumentTotalRowService } from '@app/konstructor/document-generate/product-rows/total-row.service';
import { CONTRACT_LTYPE } from '@app/konstructor/document-generate/type/contract.type';
import { ContractDto } from '@app/konstructor/dto/contract.dto';
import { OfferRenderPriceService } from '../services/render-data-services/offer-render-price.service';

/** Строка таблицы цен: набор задают `type` и `setId`, как их шлёт фронт. */
const row = (
    name: string,
    set: { type?: string; setId?: number } = {},
): ProductRowDto =>
    Object.assign(new ProductRowDto(), {
        name,
        ...set,
        price: {
            default: 1000,
            current: 1000,
            quantity: 1,
            sum: 1000,
            month: 1000,
            measure: { name: 'мес.' },
            discount: { precent: 1 },
        },
        product: { name, quantityForKp: '', contract: { contract: null } },
        supply: { name: 'Интернет 1 ОД', forkp: '' },
    });

const contract = Object.assign(new ContractDto(), {
    aprilName: 'Информационное обслуживание',
    bitrixName: 'Информационное обслуживание',
    prepayment: 1,
});

describe('OfferRenderPriceService.renderProductPrices: признаки набора', () => {
    const service = new OfferRenderPriceService(
        new DocumentTotalRowService(),
        new DocumentProductRowService(),
    );
    const render = (rows: ProductRowDto[]) =>
        service.renderProductPrices(rows, contract).ProductRows;

    it('общий набор и два набора для сравнения: признаки в порядке строк', () => {
        const items = render([
            row('Гарант-Офис', { type: 'general', setId: 0 }),
            row('Консалтинг', { type: 'general', setId: 0 }),
            row('Гарант-Офис 3 ОД', { type: 'alternative', setId: 1 }),
            row('Консалтинг 3 ОД', { type: 'alternative', setId: 1 }),
            row('Гарант-Офис 5 ОД', { type: 'alternative', setId: 2 }),
            row('Консалтинг 5 ОД', { type: 'alternative', setId: 2 }),
        ]);

        expect(items.map(item => item.ProductSetKind)).toEqual([
            'general',
            'general',
            'alternative',
            'alternative',
            'alternative',
            'alternative',
        ]);
        expect(items.map(item => item.ProductSetNumber)).toEqual([
            0, 0, 1, 1, 2, 2,
        ]);
        expect(items.map(item => item.ProductSetTitle)).toEqual([
            '',
            '',
            'Набор 1',
            'Набор 1',
            'Набор 2',
            'Набор 2',
        ]);
        expect(items.map(item => item.IsSetFirstRow)).toEqual([
            false,
            false,
            true,
            false,
            true,
            false,
        ]);
    });

    it('признаки набора идут вместе с обычными полями строки', () => {
        const [first, second] = render([
            row('Гарант-Офис', { type: 'general', setId: 0 }),
            row('Гарант-Офис 3 ОД', { type: 'alternative', setId: 1 }),
        ]);

        expect(first.ProductName).toBe('Гарант-Офис');
        expect(first.ProductNumber).toBe('1');
        expect(second.ProductName).toBe('Гарант-Офис 3 ОД');
        expect(second.ProductNumber).toBe('2');
        expect(second.ProductSum).toBe(first.ProductSum);
    });

    it('строка без type (старый клиент) — строка общего набора', () => {
        const items = render([row('Гарант-Офис'), row('Консалтинг')]);

        for (const item of items) {
            expect(item.ProductSetKind).toBe('general');
            expect(item.ProductSetNumber).toBe(0);
            expect(item.ProductSetTitle).toBe('');
            expect(item.IsSetFirstRow).toBe(false);
        }
    });

    it('счёт передаёт строки одного набора: признаки считаются по ним', () => {
        const items = render([
            row('Гарант-Офис 3 ОД', { type: 'alternative', setId: 2 }),
            row('Консалтинг 3 ОД', { type: 'alternative', setId: 2 }),
        ]);

        expect(items.map(item => item.ProductSetTitle)).toEqual([
            'Набор 2',
            'Набор 2',
        ]);
        expect(items.map(item => item.IsSetFirstRow)).toEqual([true, false]);
    });
});

describe('OfferRenderPriceService: единица измерения по виду договора', () => {
    const service = new OfferRenderPriceService(
        new DocumentTotalRowService(),
        new DocumentProductRowService(),
    );
    /** Строка и итог с мерой портала: длинная формулировка, как на порталах с полными названиями */
    const withMeasure = (measureName: string): ProductRowDto => {
        const base = row('Гарант-Офис');
        return Object.assign(base, {
            price: { ...base.price, measure: { name: measureName } },
            product: { ...base.product, contractCoefficient: 6 },
        });
    };

    it('лицензия: в колонке «Ед.» «шт.», мера портала — в подписи; в «Итого» так же', () => {
        const lic = withMeasure('Лицензия 6 месяцев');

        const [item] = service.renderProductPrices(
            [lic],
            contract,
            CONTRACT_LTYPE.LIC,
        ).ProductRows;
        const [totalRow] = service.renderTotalPrice(
            lic,
            false,
            CONTRACT_LTYPE.LIC,
        ).TotalRow;

        expect(item.ProductMeasure).toBe('шт.');
        expect(item.ProductMeasureCaption).toBe('Лицензия 6 месяцев');
        expect(totalRow.TotalMeasure).toBe('шт.');
        expect(totalRow.TotalMeasureCaption).toBe('Лицензия 6 месяцев');
    });

    it('сервисный договор: «мес.» и пустая подпись', () => {
        const services = withMeasure('месяц');

        const [item] = service.renderProductPrices(
            [services],
            contract,
            CONTRACT_LTYPE.SERVICE,
        ).ProductRows;
        const [totalRow] = service.renderTotalPrice(
            services,
            false,
            CONTRACT_LTYPE.SERVICE,
        ).TotalRow;

        expect(item.ProductMeasure).toBe('мес.');
        expect(item.ProductMeasureCaption).toBe('');
        expect(totalRow.TotalMeasure).toBe('мес.');
        expect(totalRow.TotalMeasureCaption).toBe('');
    });

    it('вид договора не передан: единица прежняя — мера портала, подписи нет', () => {
        const lic = withMeasure('Лицензия 6 месяцев');

        const [item] = service.renderProductPrices([lic], contract).ProductRows;
        const [totalRow] = service.renderTotalPrice(lic, false).TotalRow;

        expect(item.ProductMeasure).toBe('Лицензия 6 месяцев');
        expect(item.ProductMeasureCaption).toBe('');
        expect(totalRow.TotalMeasure).toBe('Лицензия 6 месяцев');
        expect(totalRow.TotalMeasureCaption).toBe('');
    });
});
