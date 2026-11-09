import { buildOwnerReportFacts } from '../owner-report';
import {
    OCTOBER,
    call,
    defaultReport,
    resetCounter,
} from './owner-report.fixture';

describe('отчёт собственнику: цены из разговоров', () => {
    beforeEach(resetCounter);

    it('нулевая сумма — не цена: не входит в разброс и не даёт деления на ноль', () => {
        const facts = buildOwnerReportFacts(
            [
                call({
                    day: '2026-10-05',
                    report: defaultReport({
                        prices: [
                            {
                                amount: 0,
                                periodMonths: 3,
                                product: null,
                                kind: 'list',
                            },
                            {
                                amount: 24000,
                                periodMonths: 12,
                                product: null,
                                kind: 'list',
                            },
                        ],
                    }),
                }),
            ],
            OCTOBER,
        );
        expect(facts.prices.n).toBe(1);
        expect(facts.prices.listPerMonth).toEqual({
            min: 2000,
            max: 2000,
            n: 1,
        });
        // Разные условия разным клиентам — не признак и не утечка.
        expect(facts.management.signs.map(sign => sign.code)).not.toContain(
            'unified_pricing',
        );
    });
});
