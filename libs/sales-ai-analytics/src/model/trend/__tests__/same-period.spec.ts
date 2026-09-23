import {
    SAME_PERIOD_LAG_MONTHS,
    SAME_PERIOD_REASONS,
    isMonthKey,
    monthFirstDay,
    monthLastDay,
    samePeriodKey,
    selectSamePeriod,
    shiftMonthKey,
    type SamePeriodInput,
} from '../same-period';

/**
 * Пара «тот же период год назад» (план Фазы 3, П3): арифметика ключей на
 * границе года и високосного февраля, отказ без истории M−12 и флаг
 * сопоставимости с причинами по решению владельца В9 (другой отдел или
 * уровень год назад — сравниваем с тем же менеджером, но
 * `comparable: false`).
 */
const BASE: SamePeriodInput = { periodKey: '2026-09', basePresent: true };

describe('shiftMonthKey / samePeriodKey', () => {
    it('сдвигает ключ на 12 месяцев и переходит через границу года', () => {
        expect(samePeriodKey('2026-09')).toBe('2025-09');
        expect(samePeriodKey('2026-01')).toBe('2025-01');
        expect(samePeriodKey('2026-12')).toBe('2025-12');
    });

    it('високосный февраль сравнивается с февралём по ключу, а не по дням', () => {
        expect(samePeriodKey('2024-02')).toBe('2023-02');
        expect(monthLastDay('2024-02')).toBe('2024-02-29');
        expect(monthLastDay('2023-02')).toBe('2023-02-28');
        expect(monthFirstDay('2023-02')).toBe('2023-02-01');
    });

    it('лаг сдвига — ровно 12 месяцев', () => {
        expect(SAME_PERIOD_LAG_MONTHS).toBe(12);
        expect(shiftMonthKey('2026-09', SAME_PERIOD_LAG_MONTHS)).toBe(
            samePeriodKey('2026-09'),
        );
    });

    it('отрицательный лаг сдвигает вперёд (нужен для границ месяца)', () => {
        expect(shiftMonthKey('2026-12', -1)).toBe('2027-01');
    });

    it('не-месяц и дробный лаг дают null', () => {
        expect(samePeriodKey('2026-W38')).toBeNull();
        expect(samePeriodKey('2026-13')).toBeNull();
        expect(samePeriodKey('2026-09-01')).toBeNull();
        expect(shiftMonthKey('2026-09', 1.5)).toBeNull();
        expect(isMonthKey('2026-00')).toBe(false);
        expect(isMonthKey('2026-09')).toBe(true);
    });
});

describe('selectSamePeriod — когда пары нет', () => {
    it('зерно не месяц: available false, причина period-not-month', () => {
        const pair = selectSamePeriod({ ...BASE, grain: 'week' });
        expect(pair).toEqual({
            periodKey: '2026-09',
            basePeriodKey: null,
            available: false,
            comparable: false,
            reasons: [SAME_PERIOD_REASONS.periodNotMonth],
        });
    });

    it('ключ периода — неделя: пары нет и текущий ключ тоже null', () => {
        const pair = selectSamePeriod({
            periodKey: '2026-W38',
            basePresent: true,
        });
        expect(pair.periodKey).toBeNull();
        expect(pair.available).toBe(false);
        expect(pair.reasons).toEqual([SAME_PERIOD_REASONS.periodNotMonth]);
    });

    it('снапшота M−12 нет: available false, ключ пары всё равно назван', () => {
        const pair = selectSamePeriod({ ...BASE, basePresent: false });
        expect(pair.available).toBe(false);
        expect(pair.comparable).toBe(false);
        expect(pair.basePeriodKey).toBe('2025-09');
        expect(pair.reasons).toEqual([SAME_PERIOD_REASONS.noHistory]);
    });
});

describe('selectSamePeriod — сопоставимость', () => {
    it('тот же состав и те же версии: comparable true без причин', () => {
        const pair = selectSamePeriod({
            ...BASE,
            current: {
                departmentId: 37,
                level: 'middle',
                tenureBand: '6-18',
                versions: 'v1',
            },
            base: {
                departmentId: 37,
                level: 'middle',
                tenureBand: '6-18',
                versions: 'v1',
            },
        });
        expect(pair).toEqual({
            periodKey: '2026-09',
            basePeriodKey: '2025-09',
            available: true,
            comparable: true,
            reasons: [],
        });
    });

    it('смена версий разбора: available true, comparable false (приёмка П3)', () => {
        const pair = selectSamePeriod({
            ...BASE,
            current: { versions: 'rubric-v2' },
            base: { versions: 'rubric-v1' },
        });
        expect(pair.available).toBe(true);
        expect(pair.comparable).toBe(false);
        expect(pair.reasons).toEqual([SAME_PERIOD_REASONS.versionsChanged]);
    });

    it('другой отдел год назад: сравниваем с тем же менеджером, но с оговоркой (В9)', () => {
        const pair = selectSamePeriod({
            ...BASE,
            current: { departmentId: 41 },
            base: { departmentId: 37 },
        });
        expect(pair.basePeriodKey).toBe('2025-09');
        expect(pair.available).toBe(true);
        expect(pair.comparable).toBe(false);
        expect(pair.reasons).toEqual([SAME_PERIOD_REASONS.departmentChanged]);
    });

    it('другой уровень и другая полоса стажа — обе причины в порядке реестра', () => {
        const pair = selectSamePeriod({
            ...BASE,
            current: { level: 'senior', tenureBand: '18+' },
            base: { level: 'middle', tenureBand: '6-18' },
        });
        expect(pair.reasons).toEqual([
            SAME_PERIOD_REASONS.levelChanged,
            SAME_PERIOD_REASONS.tenureBandChanged,
        ]);
    });

    it('неизвестная половина состава причиной не считается', () => {
        const pair = selectSamePeriod({
            ...BASE,
            current: { departmentId: 41, level: null },
            base: { departmentId: null, level: 'middle' },
        });
        expect(pair.comparable).toBe(true);
        expect(pair.reasons).toEqual([]);
    });

    it('comparableFrom внутри года: причина before-comparable', () => {
        const pair = selectSamePeriod({
            ...BASE,
            comparableFrom: '2026-01-15',
        });
        expect(pair.comparable).toBe(false);
        expect(pair.reasons).toEqual([SAME_PERIOD_REASONS.beforeComparable]);
    });

    it('comparableFrom на первый день базового месяца ряд не рвёт', () => {
        const pair = selectSamePeriod({
            ...BASE,
            comparableFrom: monthFirstDay('2025-09'),
        });
        expect(pair.comparable).toBe(true);
        expect(pair.reasons).toEqual([]);
    });

    it('событие портала между периодами делает пару несопоставимой', () => {
        const pair = selectSamePeriod({
            ...BASE,
            portalEvents: ['2026-03-11'],
        });
        expect(pair.reasons).toEqual([SAME_PERIOD_REASONS.portalEvent]);
    });

    it('событие до базового месяца включительно пару не трогает', () => {
        const pair = selectSamePeriod({
            ...BASE,
            portalEvents: [monthLastDay('2025-09'), '2024-05-01'],
        });
        expect(pair.comparable).toBe(true);
        expect(pair.reasons).toEqual([]);
    });

    it('причины не повторяются и идут в порядке реестра', () => {
        const pair = selectSamePeriod({
            ...BASE,
            current: { departmentId: 41, versions: 'v2' },
            base: { departmentId: 37, versions: 'v1' },
            comparableFrom: '2026-02-01',
            portalEvents: ['2026-02-02'],
        });
        expect(pair.reasons).toEqual([
            SAME_PERIOD_REASONS.versionsChanged,
            SAME_PERIOD_REASONS.beforeComparable,
            SAME_PERIOD_REASONS.departmentChanged,
            SAME_PERIOD_REASONS.portalEvent,
        ]);
        expect(new Set(pair.reasons).size).toBe(pair.reasons.length);
    });
});
