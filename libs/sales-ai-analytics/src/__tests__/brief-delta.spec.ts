import { AI_BRIEF_COMPARE_REASONS } from '../contracts/ai-brief.contract';
import type {
    AiBriefFact,
    AiBriefFactUnit,
    BriefCompareStatus,
} from '../contracts/ai-brief.contract';
import {
    changeWeight,
    compareFact,
    describeChange,
    describeDelta,
    isCompared,
    periodDays,
    previousPeriod,
    strongestChange,
} from '../model/brief-delta';
import { trimEvidencePack } from '../model/brief-pack';
import { factCheckBullets } from '../model/brief-factcheck';

/** У пакета есть сравнение с прошлым периодом той же длины. */
const COMPARED: BriefCompareStatus = {
    previousPeriod: { from: '2026-08-25', to: '2026-08-31' },
    reason: null,
};

/** Сравнимый факт: дельта и проценты считаются тем же compareFact. */
function compared(
    code: string,
    kind: AiBriefFact['kind'],
    value: number,
    prev: number | null,
    unit: AiBriefFactUnit = 'count',
    title = `Факт ${code}`,
): AiBriefFact {
    const { delta, deltaPct } = compareFact(value, prev);

    return {
        code,
        kind,
        title,
        value,
        unit,
        text: `${title}: ${value}`,
        prev,
        delta,
        deltaPct,
        comparable: prev !== null,
    };
}

describe('previousPeriod: прошлый период той же длины', () => {
    it('неделя 1–7 сентября → 25–31 августа', () => {
        expect(previousPeriod('2026-09-01', '2026-09-07')).toEqual({
            from: '2026-08-25',
            to: '2026-08-31',
        });
        expect(periodDays('2026-09-01', '2026-09-07')).toBe(7);
    });

    it('месяц 1–30 сентября → 30 дней до него, а не «календарный август»', () => {
        expect(previousPeriod('2026-09-01', '2026-09-30')).toEqual({
            from: '2026-08-02',
            to: '2026-08-31',
        });
    });

    it('граница года: 1–7 января → 25–31 декабря прошлого года', () => {
        expect(previousPeriod('2026-01-01', '2026-01-07')).toEqual({
            from: '2025-12-25',
            to: '2025-12-31',
        });
    });

    it('високосный февраль считается по дням', () => {
        expect(previousPeriod('2028-03-01', '2028-03-31')).toEqual({
            from: '2028-01-30',
            to: '2028-02-29',
        });
        expect(periodDays('2028-02-01', '2028-02-29')).toBe(29);
    });

    it('прошлый период всегда той же длины и кончается за день до начала', () => {
        const ranges: [string, string][] = [
            ['2026-09-01', '2026-09-07'],
            ['2026-03-29', '2026-04-04'],
            ['2026-10-19', '2026-11-01'],
            ['2026-01-01', '2026-03-31'],
        ];
        for (const [from, to] of ranges) {
            const prev = previousPeriod(from, to);

            expect(periodDays(prev.from, prev.to)).toBe(periodDays(from, to));
            expect(prev.to < from).toBe(true);
            // От конца прошлого периода до начала текущего — два дня включительно.
            expect(periodDays(prev.to, from)).toBe(2);
        }
    });

    it('один день сравнивается с предыдущим днём; кривые даты — длина 1', () => {
        expect(previousPeriod('2026-03-01', '2026-03-01')).toEqual({
            from: '2026-02-28',
            to: '2026-02-28',
        });
        expect(periodDays('2026-03-05', '2026-03-01')).toBe(1);
        expect(periodDays('не дата', '2026-03-01')).toBe(1);
    });
});

describe('compareFact: изменение к прошлому периоду', () => {
    it('разница и проценты; при нулевом прошлом проценты null', () => {
        expect(compareFact(68, 31)).toEqual({ delta: 37, deltaPct: 119.4 });
        expect(compareFact(3, 5)).toEqual({ delta: -2, deltaPct: -40 });
        expect(compareFact(4, 0)).toEqual({ delta: 4, deltaPct: null });
    });

    it('без значения или прошлого периода сравнения нет', () => {
        expect(compareFact(null, 5)).toEqual({ delta: null, deltaPct: null });
        expect(compareFact(5, null)).toEqual({ delta: null, deltaPct: null });
        expect(compareFact(5, undefined)).toEqual({
            delta: null,
            deltaPct: null,
        });
    });
});

describe('describeDelta: изменение словами без причинности', () => {
    it('кратность словами: вдвое/втрое больше и меньше', () => {
        expect(describeDelta(compared('a', 'alert', 68, 31))).toBe(
            'вдвое больше, чем за прошлый период (31)',
        );
        expect(describeDelta(compared('a', 'alert', 93, 31))).toBe(
            'втрое больше, чем за прошлый период (31)',
        );
        expect(describeDelta(compared('a', 'alert', 15, 31))).toBe(
            'вдвое меньше, чем за прошлый период (31)',
        );
        expect(describeDelta(compared('a', 'alert', 10, 31))).toBe(
            'втрое меньше, чем за прошлый период (31)',
        );
    });

    it('кратность вне полос «вдвое» и «втрое» печатается точной разницей', () => {
        expect(describeDelta(compared('a', 'alert', 155, 31))).toBe(
            'больше на 124, чем за прошлый период (31)',
        );
        expect(describeDelta(compared('a', 'alert', 0, 31))).toBe(
            'меньше на 31, чем за прошлый период (31)',
        );
        expect(describeDelta(compared('a', 'alert', 81, 31))).toBe(
            'больше на 50, чем за прошлый период (31)',
        );
        expect(describeDelta(compared('a', 'alert', 50, 31))).toBe(
            'больше на 19, чем за прошлый период (31)',
        );
    });

    it('значения, которые печатаются одинаково, — «столько же»', () => {
        expect(
            describeDelta(compared('d', 'discipline', 0.1781, 0.1779, 'share')),
        ).toBe('столько же, сколько за прошлый период');
        expect(
            describeDelta(compared('q', 'deviation', 7.23, 7.21, 'score')),
        ).toBe('столько же, сколько за прошлый период');
        expect(
            describeDelta(compared('r', 'finance', 1000.4, 1000.1, 'rub')),
        ).toBe('столько же, сколько за прошлый период');
    });

    it('небольшая разница — «больше/меньше на N», равенство — «столько же»', () => {
        expect(describeDelta(compared('s', 'finance', 3, 5))).toBe(
            'меньше на 2, чем за прошлый период (5)',
        );
        expect(describeDelta(compared('c', 'telephony', 408, 350))).toBe(
            'больше на 58, чем за прошлый период (350)',
        );
        expect(describeDelta(compared('c', 'telephony', 350, 350))).toBe(
            'столько же, сколько за прошлый период',
        );
    });

    it('доли: «выше/ниже, чем за прошлый период (было X %)»', () => {
        expect(
            describeDelta(compared('d', 'discipline', 0.178, 0.224, 'share')),
        ).toBe('ниже, чем за прошлый период (было 22,4 %)');
        expect(
            describeDelta(compared('d', 'discipline', 0.3, 0.224, 'share')),
        ).toBe('выше, чем за прошлый период (было 22,4 %)');
    });

    it('рубли печатаются с разрядами; за прошлый период не было — словами', () => {
        expect(
            describeDelta(
                compared('r', 'finance', 1_500_000, 1_200_000, 'rub'),
            ),
        ).toBe('больше на 300 000 ₽, чем за прошлый период (1 200 000 ₽)');
        expect(describeDelta(compared('a', 'alert', 4, 0))).toBe(
            'за прошлый период не было',
        );
    });

    it('несравнимый факт даёт пустую строку, а describeChange — фразу факта', () => {
        const fact = compared('a', 'alert', 4, null);

        expect(describeDelta(fact)).toBe('');
        expect(describeChange(fact)).toBe('Факт a: 4');
        expect(describeChange(compared('a', 'alert', 68, 31))).toBe(
            'Факт a: 68 — вдвое больше, чем за прошлый период (31)',
        );
    });

    it('фразы изменения не содержат причинности и проходят факт-чек', () => {
        const facts = [
            compared('a', 'alert', 68, 31),
            compared('s', 'finance', 3, 5),
            compared('d', 'discipline', 0.178, 0.224, 'share'),
        ];
        const pack = trimEvidencePack(facts, {
            compare: {
                previousPeriod: { from: '2026-08-25', to: '2026-08-31' },
                reason: null,
            },
        });
        const checked = factCheckBullets(
            facts.map(fact => ({
                text: describeChange(fact),
                group: 'change' as const,
                factRefs: [fact.code],
            })),
            pack,
        );

        expect(checked.passRatePct).toBe(100);
        for (const fact of facts) {
            expect(describeChange(fact)).not.toMatch(/из-за|поэтому|значим/);
        }
    });
});

describe('strongestChange: самое сильное изменение пакета', () => {
    it('выбирает наибольший |deltaPct|; при равенстве — старший вид', () => {
        const pack = trimEvidencePack(
            [
                compared('sales', 'finance', 3, 5),
                compared('alerts', 'alert', 68, 31),
                compared('calls', 'telephony', 408, 350),
            ],
            { compare: COMPARED },
        );

        expect(strongestChange(pack)?.code).toBe('alerts');

        const tie = trimEvidencePack(
            [
                compared('calls', 'telephony', 62, 31),
                compared('alerts', 'alert', 62, 31),
            ],
            { compare: COMPARED },
        );
        expect(strongestChange(tie)?.code).toBe('alerts');
    });

    it('«не было — появилось» весит как удвоение; без изменений — null', () => {
        const fromZero = trimEvidencePack(
            [
                compared('calls', 'telephony', 408, 350),
                compared('alerts', 'alert', 4, 0),
            ],
            { compare: COMPARED },
        );
        const alerts = fromZero.facts.find(fact => fact.code === 'alerts');

        expect(strongestChange(fromZero)?.code).toBe('alerts');
        expect(alerts && changeWeight(fromZero, alerts)).toBe(100);

        const still = trimEvidencePack(
            [
                compared('calls', 'telephony', 350, 350),
                compared('alerts', 'alert', 0, 0),
                compared('sales', 'finance', 4, null),
            ],
            { compare: COMPARED },
        );
        expect(strongestChange(still)).toBeNull();
    });

    it('у пакета без сравнения изменений нет, даже если факт несёт прошлое значение', () => {
        const fact = compared('alerts', 'alert', 68, 31);
        for (const reason of Object.values(AI_BRIEF_COMPARE_REASONS)) {
            const pack = trimEvidencePack([fact], {
                compare: { previousPeriod: null, reason },
            });

            expect(isCompared(pack, fact)).toBe(false);
            expect(changeWeight(pack, fact)).toBe(-1);
            expect(strongestChange(pack)).toBeNull();
        }
        expect(
            isCompared(trimEvidencePack([fact], { compare: COMPARED }), fact),
        ).toBe(true);
    });
});
