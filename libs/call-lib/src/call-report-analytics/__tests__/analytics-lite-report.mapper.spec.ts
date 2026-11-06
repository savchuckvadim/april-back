import {
    emptyReport,
    mapLiteReport,
} from '../lib/analytics-lite-report.mapper';

describe('mapLiteReport', () => {
    it('проецирует факты отчёта из user_result разбора', () => {
        expect(
            mapLiteReport({
                outcome: 'postponed',
                issues: [
                    {
                        code: 'crm_duplicate',
                        quote: 'Вы уже звонили вчера',
                        note: 'два менеджера за день',
                    },
                    { quote: 'без кода — пропускается' },
                ],
                prices: [
                    {
                        amount: 25500,
                        periodMonths: 3,
                        product: 'Универсал',
                        kind: 'promo',
                        quote: 'за три месяца 25 500',
                    },
                    { amount: 102000, periodMonths: 12.4, kind: 'list' },
                    { amount: -1, kind: 'list' },
                    { periodMonths: 12, kind: 'list' },
                ],
                upsell: { attempted: true, kind: 'period', what: 'на год' },
                selfIntro: {
                    introduced: true,
                    companyNamed: false,
                    offerQuestion: 'evasive',
                },
            }),
        ).toEqual({
            outcome: 'postponed',
            issues: [{ code: 'crm_duplicate', quote: 'Вы уже звонили вчера' }],
            prices: [
                {
                    amount: 25500,
                    periodMonths: 3,
                    product: 'Универсал',
                    kind: 'promo',
                },
                {
                    amount: 102000,
                    periodMonths: 12,
                    product: null,
                    kind: 'list',
                },
            ],
            upsellAttempted: true,
            upsellKind: 'period',
            selfIntro: {
                introduced: true,
                companyNamed: false,
                offerQuestion: 'evasive',
            },
        });
    });

    it('старый разбор без фактов и отсутствие разбора — пустые факты', () => {
        expect(mapLiteReport({ score: 7 })).toEqual(emptyReport());
        expect(mapLiteReport(null)).toEqual(emptyReport());
    });

    it('чужие типы значений в факты не попадают', () => {
        expect(
            mapLiteReport({
                outcome: 7,
                issues: 'crm_duplicate',
                prices: { amount: 100 },
                upsell: 'yes',
                selfIntro: [],
            }),
        ).toEqual(emptyReport());
    });

    it('пустые экземпляры не разделяются между строками', () => {
        const first = emptyReport();
        const second = emptyReport();
        first.issues.push({ code: 'telephony', quote: null });
        expect(second.issues).toEqual([]);
    });
});
