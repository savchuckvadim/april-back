import { ProductRowDto } from '../../dto/product-row/product-row.dto';
import { ClientTypeEnum } from '../../type/client.type';
import { DocumentProductRowService } from '../product-row.service';

/** Строка: цена до скидки и со скидкой за единицу, количество. */
const row = (base: number, current: number, quantity: number): ProductRowDto =>
    ({
        name: 'Гарант-Офис',
        price: {
            default: base,
            current,
            quantity,
            sum: current * quantity,
            month: base,
            measure: { name: 'мес.' },
            discount: { precent: current / base },
        },
        product: { name: 'Гарант-Офис', contract: { contract: null } },
        supply: { name: 'Интернет 1 ОД', forkp: '' },
    }) as unknown as ProductRowDto;

describe('DocumentProductRowService.getProducts', () => {
    const service = new DocumentProductRowService();
    // услуги, 4 месяца, скидка 20%: 10 000 → 8 000 в месяц
    const services4 = row(10000, 8000, 4);

    it('договор бюджетника: одна единица (как Laravel)', () => {
        const [product] = service.getProducts(
            [services4],
            'Договор',
            true,
            1,
            ClientTypeEnum.ORG_STATE,
        );
        expect(product.productQuantity).toBe(1);
    });

    it('КП и счёт: количество как в наборе, у бюджетника тоже', () => {
        const [product] = service.getProducts(
            [services4],
            'Договор',
            true,
            1,
            null,
        );
        expect(product.productQuantity).toBe(4);
        expect(product.productSum).toBe('32000.00');
    });

    it('в месяц — со скидкой: сумма / количество / месяцев договора', () => {
        const [product] = service.getProducts(
            [services4],
            'Договор',
            true,
            1,
            null,
        );
        expect(product.productMonthSum).toBe('8000.00');
        // лицензия на 6 мес. одной штукой: 48 000 / 6
        const [lic] = service.getProducts(
            [row(60000, 48000, 1)],
            'Лиц.',
            true,
            6,
            null,
        );
        expect(lic.productMonthSum).toBe('8000.00');
    });

    describe('название строки для счёта (ProductByContractName)', () => {
        const EPS_SERVICES =
            'Услуги по сопровождению Электронного периодического справочника «Система ГАРАНТ»';
        const named = (
            name: string,
            type: 'garant' | 'academy',
            forkp: string,
        ): ProductRowDto =>
            ({
                ...row(1500, 1500, 12),
                name,
                productType: type,
                product: {
                    name,
                    type,
                    contract: { contract: { productName: EPS_SERVICES } },
                },
                supply: { name: '', forkp },
            }) as unknown as ProductRowDto;

        it('Гарант — с формулировкой договора и поставкой', () => {
            const [product] = service.getProducts(
                [
                    named(
                        'Гарант-Бухгалтер',
                        'garant',
                        'Интернет версия на 1 одновременный доступ к системе',
                    ),
                ],
                'Интернет',
                true,
                1,
                null,
            );
            expect(product.productContractName).toBe(EPS_SERVICES);
            expect(product.productWithContractName).toBe(
                `${EPS_SERVICES} Гарант-Бухгалтер Интернет версия на 1 одновременный доступ к системе`,
            );
        });

        it('Академия — без «Услуги по сопровождению…»', () => {
            const [product] = service.getProducts(
                [named('Академия PRO', 'academy', '')],
                'Интернет',
                true,
                1,
                null,
            );
            expect(product.productContractName).toBe('');
            expect(product.productWithContractName).toBe('Академия PRO');
        });
    });

    it('скидка — за всё количество и в месяц', () => {
        const [product] = service.getProducts(
            [services4],
            'Договор',
            true,
            1,
            null,
        );
        expect(product.productDiscountSum).toBe('8000.00');
        expect(product.productDiscountSumMonth).toBe('2000.00');
    });
});
