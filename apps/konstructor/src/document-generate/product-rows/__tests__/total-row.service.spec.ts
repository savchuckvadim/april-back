import { ProductRowDto } from '../../dto/product-row/product-row.dto';
import { ClientTypeEnum } from '../../type/client.type';
import { DocumentTotalRowService } from '../total-row.service';

/** Итоговая строка набора: цена единицы, количество, месяцев в единице. */
const total = (
    current: number,
    quantity: number,
    contractCoefficient: number,
    measure: string,
): ProductRowDto =>
    ({
        name: 'Гарант-Офис',
        price: {
            current,
            quantity,
            sum: current * quantity,
            measure: { name: measure },
            discount: { precent: 1 },
        },
        product: { contractCoefficient },
    }) as unknown as ProductRowDto;

/** Договор услуг, 4 месяца авансом */
const service4 = total(8187, 4, 1, 'мес.');
/** Лицензия на 6 месяцев, одна штука */
const lic6 = total(49122, 1, 6, 'лиц. 6 мес.');

describe('DocumentTotalRowService', () => {
    const service = new DocumentTotalRowService();

    describe('договор', () => {
        it('total_month_sum — цена единицы: лицензию помесячно не раскладываем', () => {
            const data = service.getContractData(
                lic6,
                ClientTypeEnum.ORG,
                false,
            );
            expect(data.total_month_sum).toBe('49122.00');
            expect(data.total_prepayment_sum).toBe('49122.00');
        });

        it('бюджетник: без аванса, «предоплата» — одна единица', () => {
            const data = service.getContractData(
                service4,
                ClientTypeEnum.ORG_STATE,
                false,
            );
            expect(data.total_prepayment_quantity).toBe(1);
            expect(data.total_prepayment_sum).toBe('8187.00');
            expect(data.contract_total_sum).toBe('32748.00');
        });

        it('коммерческий: предоплата — вся сумма за срок', () => {
            const data = service.getContractData(
                service4,
                ClientTypeEnum.ORG,
                false,
            );
            expect(data.total_prepayment_sum).toBe('32748.00');
            expect(data.total_prepayment_quantity_string).toBe('4 месяца');
        });
    });

    describe('КП', () => {
        it('цена за месяц: сумма / количество / месяцев договора', () => {
            expect(
                service.getOfferData(service4, false).total_per_month_sum,
            ).toBe('8187.00');
            expect(service.getOfferData(lic6, false).total_per_month_sum).toBe(
                '8187.00',
            );
        });

        it('цена единицы для строки «Итого» не меняется', () => {
            expect(service.getOfferData(lic6, false).total_month_sum).toBe(
                '49122.00',
            );
        });

        it('договорной логики бюджетников нет: предоплата — вся сумма', () => {
            const data = service.getOfferData(service4, false);
            expect(data.total_prepayment_sum).toBe('32748.00');
            expect(data.total_prepayment_quantity).toBe(4);
        });

        it('нулевой срок — ноль, не «не число»', () => {
            expect(
                service.getOfferData(total(100, 0, 1, 'мес.'), false)
                    .total_per_month_sum,
            ).toBe('0.00');
        });
    });
});
