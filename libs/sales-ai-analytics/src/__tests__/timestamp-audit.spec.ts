import {
    TIMESTAMP_LEAK_MAX,
    type SaleTimestampFact,
    saleTimestampLeak,
    timestampLeakShare,
} from '../model/timestamp-audit';

const day = (number: number): string =>
    `2026-06-${String(number).padStart(2, '0')}T12:00:00+03:00`;

/** Нормальная продажа: закрытие позже последней презентации и счёта. */
const clean = (index: number): SaleTimestampFact => ({
    episodeKey: `D${index}#0`,
    closedAt: day(20),
    lastPresentationAt: day(10),
    lastInvoiceAt: day(15),
});

/** Продажа с закрытием раньше презентации — метки проставлены задним числом. */
const leaked = (index: number): SaleTimestampFact => ({
    episodeKey: `D${index}#0`,
    closedAt: day(5),
    lastPresentationAt: day(9),
    lastInvoiceAt: null,
});

describe('timestampLeakShare: плацебо-тест меток времени', () => {
    it('одна продажа из десяти с закрытием раньше презентации даёт 10 % и флаг', () => {
        const sales = [
            leaked(0),
            ...Array.from({ length: 9 }, (_, index) => clean(index + 1)),
        ];
        expect(timestampLeakShare(sales)).toMatchObject({
            n: 10,
            leaked: 1,
            sharePct: 10,
            maxPct: TIMESTAMP_LEAK_MAX,
            flagged: true,
        });
    });

    it('протёкшие эпизоды перечислены с опережением в днях', () => {
        const { leaks } = timestampLeakShare([leaked(7)]);
        expect(leaks).toEqual([
            { episodeKey: 'D7#0', source: 'presentation', aheadDays: 4 },
        ]);
    });

    it('чистая выборка не поднимает флаг', () => {
        expect(
            timestampLeakShare(
                Array.from({ length: 10 }, (_, index) => clean(index)),
            ),
        ).toMatchObject({ leaked: 0, sharePct: 0, flagged: false });
    });

    it('ровно на пороге 5 % флаг не поднимается', () => {
        const sales = [
            leaked(0),
            ...Array.from({ length: 19 }, (_, index) => clean(index + 1)),
        ];
        expect(timestampLeakShare(sales)).toMatchObject({
            sharePct: 5,
            flagged: false,
        });
    });

    it('порог задаётся параметром в доле', () => {
        const sales = [
            leaked(0),
            ...Array.from({ length: 9 }, (_, index) => clean(index + 1)),
        ];
        expect(timestampLeakShare(sales, 0.2)).toMatchObject({
            sharePct: 10,
            maxPct: 0.2,
            flagged: false,
        });
    });

    it('пустая выборка — 0 % без флага', () => {
        expect(timestampLeakShare([])).toMatchObject({
            n: 0,
            leaked: 0,
            sharePct: 0,
            flagged: false,
        });
    });

    it('нечисловой порог заменяется дефолтом реестра', () => {
        expect(timestampLeakShare([leaked(1)], Number.NaN).maxPct).toBe(
            TIMESTAMP_LEAK_MAX,
        );
    });
});

describe('saleTimestampLeak: одна продажа', () => {
    it('счёт позже закрытия — источник invoice', () => {
        expect(
            saleTimestampLeak({
                episodeKey: 'D1#2',
                closedAt: day(5),
                lastPresentationAt: day(3),
                lastInvoiceAt: day(8),
            }),
        ).toEqual({
            episodeKey: 'D1#2',
            source: 'invoice',
            aheadDays: 3,
        });
    });

    it('обе метки позже закрытия — берётся более поздняя', () => {
        expect(
            saleTimestampLeak({
                episodeKey: 'D2#0',
                closedAt: day(2),
                lastPresentationAt: day(9),
                lastInvoiceAt: day(4),
            }),
        ).toMatchObject({ source: 'presentation', aheadDays: 7 });
    });

    it('метка ровно в момент закрытия протечкой не считается', () => {
        expect(
            saleTimestampLeak({
                episodeKey: 'D3#0',
                closedAt: day(5),
                lastPresentationAt: day(5),
                lastInvoiceAt: null,
            }),
        ).toBeNull();
    });

    it('продажа без активностей протечкой не считается', () => {
        expect(
            saleTimestampLeak({
                episodeKey: 'D4#0',
                closedAt: day(5),
                lastPresentationAt: null,
                lastInvoiceAt: null,
            }),
        ).toBeNull();
    });

    it('неразбираемая дата закрытия в протечки не попадает, но остаётся в знаменателе', () => {
        const sale: SaleTimestampFact = {
            episodeKey: 'D5#0',
            closedAt: 'не дата',
            lastPresentationAt: day(9),
            lastInvoiceAt: null,
        };
        expect(saleTimestampLeak(sale)).toBeNull();
        expect(timestampLeakShare([sale])).toMatchObject({
            n: 1,
            leaked: 0,
            sharePct: 0,
        });
    });
});
