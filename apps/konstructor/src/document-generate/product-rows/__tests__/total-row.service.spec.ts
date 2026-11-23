import { ProductRowDto } from '../../dto/product-row/product-row.dto';
import { ClientTypeEnum } from '../../type/client.type';
import { CONTRACT_LTYPE } from '../../type/contract.type';
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

    describe('единица измерения по виду договора', () => {
        it('сервисный договор: «мес.» без подписи', () => {
            const data = service.getContractData(
                total(8187, 4, 1, 'месяц'),
                ClientTypeEnum.ORG,
                false,
                CONTRACT_LTYPE.SERVICE,
            );
            expect(data.total_measure).toBe('мес.');
            expect(data.total_measure_caption).toBe('');
        });

        it('лицензия: «шт.» и мера портала в подписи — в договоре и в КП', () => {
            const lic = total(49122, 1, 6, 'Лицензия 6 месяцев');
            const contract = service.getContractData(
                lic,
                ClientTypeEnum.ORG,
                false,
                CONTRACT_LTYPE.LIC,
            );
            const offer = service.getOfferData(lic, false, CONTRACT_LTYPE.LIC);
            for (const data of [contract, offer]) {
                expect(data.total_measure).toBe('шт.');
                expect(data.total_measure_caption).toBe('Лицензия 6 месяцев');
            }
        });

        it('вид договора не передан: мера портала как есть, подписи нет', () => {
            const data = service.getOfferData(lic6, false);
            expect(data.total_measure).toBe('лиц. 6 мес.');
            expect(data.total_measure_caption).toBe('');
        });

        it('суммы от единицы не зависят', () => {
            const withType = service.getOfferData(
                lic6,
                false,
                CONTRACT_LTYPE.LIC,
            );
            const without = service.getOfferData(lic6, false);
            expect({
                ...withType,
                total_measure: '',
                total_measure_caption: '',
            }).toEqual({
                ...without,
                total_measure: '',
                total_measure_caption: '',
            });
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
