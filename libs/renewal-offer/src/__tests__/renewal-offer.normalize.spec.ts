import type { RenewalOfferInputDto } from '../dto/renewal-offer.dto';
import {
    RENEWAL_PRICE_DEFAULTS,
    calcMonthlyTotal,
} from '../lib/renewal-offer.model';
import { normalizeRenewalOffer } from '../lib/renewal-offer.normalize';

const input = (
    patch: Partial<RenewalOfferInputDto> = {},
): RenewalOfferInputDto =>
    ({ clientName: 'ООО Ромашка', ...patch }) as RenewalOfferInputDto;

describe('normalizeRenewalOffer: прайс по умолчанию', () => {
    it('пустой запрос даёт предложение по прайсу', () => {
        const offer = normalizeRenewalOffer(input());
        expect(offer.salesPrice).toBe(RENEWAL_PRICE_DEFAULTS.sales);
        expect(offer.aiBasePrice).toBe(RENEWAL_PRICE_DEFAULTS.aiBase);
        expect(offer.devHourPrice).toBe(RENEWAL_PRICE_DEFAULTS.devHour);
        expect(offer.devHours).toBe(RENEWAL_PRICE_DEFAULTS.devHours);
    });

    it('по умолчанию включены приложения, AI и разработка, менеджер — нет', () => {
        const offer = normalizeRenewalOffer(input());
        expect(offer.salesIncluded).toBe(true);
        expect(offer.aiIncluded).toBe(true);
        expect(offer.devIncluded).toBe(true);
        expect(offer.managerIncluded).toBe(false);
    });

    it('цена 0 — это цена, а не «не указано»', () => {
        // Иначе бесплатную услугу нельзя было бы оформить.
        const offer = normalizeRenewalOffer(input({ salesPrice: 0 }));
        expect(offer.salesPrice).toBe(0);
    });

    it('false в составе не подменяется значением по умолчанию', () => {
        const offer = normalizeRenewalOffer(
            input({ salesIncluded: false, devIncluded: false }),
        );
        expect(offer.salesIncluded).toBe(false);
        expect(offer.devIncluded).toBe(false);
    });
});

describe('normalizeRenewalOffer: границы', () => {
    it('отрицательная цена поднимается до нуля', () => {
        const offer = normalizeRenewalOffer(input({ salesPrice: -500 }));
        expect(offer.salesPrice).toBe(0);
    });

    it('слишком большая цена обрезается', () => {
        const offer = normalizeRenewalOffer(input({ salesPrice: 99_000_000 }));
        expect(offer.salesPrice).toBe(1_000_000);
    });

    it('скидка может быть отрицательной', () => {
        const offer = normalizeRenewalOffer(input({ adjustment: -2000 }));
        expect(offer.adjustment).toBe(-2000);
    });

    it('ноль сотрудников поднимается до одного', () => {
        const offer = normalizeRenewalOffer(input({ aiEmployees: 0 }));
        expect(offer.aiEmployees).toBe(1);
    });

    it('дробное число сотрудников округляется', () => {
        const offer = normalizeRenewalOffer(input({ aiEmployees: 7.4 }));
        expect(offer.aiEmployees).toBe(7);
    });
});

describe('normalizeRenewalOffer: подписи и названия', () => {
    it('пробелы вокруг названия клиента убираются', () => {
        const offer = normalizeRenewalOffer(
            input({ clientName: '  ООО Ромашка  ' }),
        );
        expect(offer.clientName).toBe('ООО Ромашка');
    });

    it('пустая подпись скидки заменяется словом «Скидка»', () => {
        const offer = normalizeRenewalOffer(input({ adjustmentLabel: '   ' }));
        expect(offer.adjustmentLabel).toBe('Скидка');
    });

    it('своя подпись скидки сохраняется', () => {
        const offer = normalizeRenewalOffer(
            input({ adjustmentLabel: 'Скидка за год вперёд' }),
        );
        expect(offer.adjustmentLabel).toBe('Скидка за год вперёд');
    });
});

describe('normalizeRenewalOffer: другие услуги', () => {
    it('услуга без названия отбрасывается', () => {
        const offer = normalizeRenewalOffer(
            input({
                extras: [
                    { title: '   ', price: 100, period: 'month' },
                    { title: 'Телефония', price: 3000, period: 'month' },
                ],
            }),
        );
        expect(offer.extras).toEqual([
            { title: 'Телефония', price: 3000, period: 'month' },
        ]);
    });

    it('неизвестная периодичность считается месячной', () => {
        const offer = normalizeRenewalOffer(
            input({
                extras: [
                    {
                        title: 'Телефония',
                        price: 3000,
                        period: 'quarter',
                    } as unknown as {
                        title: string;
                        price: number;
                        period: 'month';
                    },
                ],
            }),
        );
        expect(offer.extras[0]?.period).toBe('month');
    });

    it('больше десяти услуг не берём', () => {
        const extras = Array.from({ length: 15 }, (_, i) => ({
            title: `Услуга ${i}`,
            price: 100,
            period: 'month' as const,
        }));
        const offer = normalizeRenewalOffer(input({ extras }));
        expect(offer.extras).toHaveLength(10);
    });

    it('без услуг список пустой, а не undefined', () => {
        expect(normalizeRenewalOffer(input()).extras).toEqual([]);
    });
});

describe('итог после нормализации', () => {
    it('совпадает с суммой включённых услуг и скидки', () => {
        const offer = normalizeRenewalOffer(
            input({
                salesPrice: 6500,
                aiEmployees: 7,
                managerIncluded: true,
                adjustment: -2000,
                extras: [{ title: 'Телефония', price: 3000, period: 'month' }],
            }),
        );
        // 6500 + (7500 + 4 × 1000) + 10000 + 3000 − 2000
        expect(calcMonthlyTotal(offer)).toBe(29_000);
    });

    it('скидка больше суммы не делает платёж отрицательным', () => {
        const offer = normalizeRenewalOffer(
            input({ aiIncluded: false, salesPrice: 1000, adjustment: -5000 }),
        );
        expect(calcMonthlyTotal(offer)).toBe(0);
    });

    it('разовая услуга в месячный итог не входит', () => {
        const offer = normalizeRenewalOffer(
            input({
                aiIncluded: false,
                salesPrice: 5000,
                extras: [{ title: 'Обучение', price: 15000, period: 'once' }],
            }),
        );
        expect(calcMonthlyTotal(offer)).toBe(5000);
    });
});
