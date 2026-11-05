import { rateMetric } from '../model/metric';
import {
    PULSE_DEFAULTS,
    PULSE_WINDOW_LOOKBACK_FACTOR,
    PulseCallRow,
    computePulse,
    pulseWindowDays,
} from '../model/pulse';
import { DEFAULT_WORK_CALENDAR } from '../model/workdays.util';

// Октябрь–ноябрь 2026: 29.10 — четверг, 31.10–01.11 — выходные,
// 04.11 — среда (праздник, которого календарь по умолчанию не знает).
const END = '2026-11-04';
const CAL = DEFAULT_WORK_CALENDAR;

let seq = 0;
const call = (day: string, patch: Partial<PulseCallRow> = {}): PulseCallRow => {
    seq += 1;
    return {
        transcriptionId: `w${seq}`,
        managerId: 'm1',
        callStartedAt: new Date(`${day}T10:00:00+03:00`),
        durationSec: 600,
        analysisPresent: true,
        nextStep: { set: true, date: '2026-11-20' },
        riskFlags: [],
        coachingPriority: null,
        ...patch,
    };
};
const calls = (day: string, count: number, withDate = count): PulseCallRow[] =>
    Array.from({ length: count }, (_, index) =>
        call(
            day,
            index < withDate ? {} : { nextStep: { set: true, date: null } },
        ),
    );

describe('pulseWindowDays', () => {
    it('без дней со звонками — окно по календарю', () => {
        expect(pulseWindowDays(END, 5, CAL)).toEqual([
            '2026-10-29',
            '2026-10-30',
            '2026-11-02',
            '2026-11-03',
            '2026-11-04',
        ]);
    });

    it('рабочий день без звонков — выходной: окно берёт день раньше', () => {
        const active = new Set([
            '2026-10-28',
            '2026-10-29',
            '2026-10-30',
            '2026-11-02',
            '2026-11-03',
        ]);
        expect(pulseWindowDays(END, 5, CAL, active)).toEqual([
            '2026-10-28',
            '2026-10-29',
            '2026-10-30',
            '2026-11-02',
            '2026-11-03',
        ]);
    });

    it('назад не дальше окна × коэффициент; звонков нет вовсе — окно по календарю', () => {
        expect(PULSE_WINDOW_LOOKBACK_FACTOR).toBe(2);
        // 20.10 — раньше 10 рабочих дней поиска (22.10–04.11)
        const stale = new Set(['2026-10-20']);
        expect(pulseWindowDays(END, 5, CAL, stale)).toEqual(
            pulseWindowDays(END, 5, CAL),
        );
        // В пределах поиска только два дня — окно из двух дней
        const few = new Set(['2026-10-22', '2026-11-03']);
        expect(pulseWindowDays(END, 5, CAL, few)).toEqual([
            '2026-10-22',
            '2026-11-03',
        ]);
    });
});

describe('computePulse: дни без звонков, значок и строки сотрудников', () => {
    it('skipDaysWithoutCalls: праздник без звонков не съедает день окна', () => {
        const rows = [
            ...calls('2026-10-28', 2),
            ...calls('2026-10-29', 2),
            ...calls('2026-10-30', 2),
            ...calls('2026-11-02', 2),
            ...calls('2026-11-03', 2),
        ];
        const strict = computePulse(rows, { endDate: END, calendar: CAL });
        expect(strict.window.from).toBe('2026-10-29');
        expect(strict.analyzedCalls).toBe(8);

        const skipping = computePulse(rows, {
            endDate: END,
            calendar: CAL,
            skipDaysWithoutCalls: true,
        });
        expect(skipping.window).toEqual({
            from: '2026-10-28',
            to: '2026-11-03',
            workdays: [
                '2026-10-28',
                '2026-10-29',
                '2026-10-30',
                '2026-11-02',
                '2026-11-03',
            ],
        });
        expect(skipping.analyzedCalls).toBe(10);
    });

    it('XmR только по дням с разборами не меньше xmrDayMinN: один звонок дня не даёт «выше коридора»', () => {
        expect(PULSE_DEFAULTS.xmrDayMinN).toBe(5);
        // Ровный ряд 1/6 по полным дням; последний день — один звонок,
        // и тот с датой: 100 %.
        const rows = [
            ...calls('2026-10-27', 6, 1),
            ...calls('2026-10-28', 6, 1),
            ...calls('2026-10-29', 6, 1),
            ...calls('2026-10-30', 6, 1),
            ...calls('2026-11-03', 1, 1),
        ];
        const result = computePulse(rows, { endDate: END, calendar: CAL });
        expect(result.daily.map(point => point.key)).toContain('2026-11-03');
        expect(result.xmr?.state).toBe('in');

        const noisy = computePulse(rows, {
            endDate: END,
            calendar: CAL,
            xmrDayMinN: 1,
        });
        expect(noisy.xmr?.state).toBe('above');
    });

    it('мало полных дней — значка нет', () => {
        const rows = [...calls('2026-10-29', 6), ...calls('2026-10-30', 6)];
        expect(
            computePulse(rows, { endDate: END, calendar: CAL }).xmr,
        ).toBeNull();
    });

    it('строка сотрудника при пороге 5 показывает долю числом, а не «мало данных»', () => {
        const rows = calls('2026-11-02', 5, 3);
        const result = computePulse(rows, {
            endDate: END,
            calendar: CAL,
            managerMinN: 5,
        });
        expect(result.byManager).toHaveLength(1);
        expect(result.byManager[0].nextStepDateRate.value).toBeCloseTo(0.6, 10);
        expect(result.byManager[0].nextStepDateRate.confidence.level).toBe(
            'low',
        );
        // доля отдела по тем же 5 звонкам — по общему порогу (8)
        expect(result.nextStepDateRate.value).toBeNull();
    });
});

describe('rateMetric: свой порог «мало данных»', () => {
    it('noneBelow ниже общего — значение есть; не задан — общий порог', () => {
        expect(rateMetric(3, 5).value).toBeNull();
        expect(rateMetric(3, 5, 5).value).toBeCloseTo(0.6, 10);
        expect(rateMetric(3, 4, 5).value).toBeNull();
    });
});

describe('computePulse: неделей раньше и звонки-примеры менеджера', () => {
    it('прошлое окно — те же правила дней, своя доля; разборов нет — null', () => {
        const rows = [
            // прошлое окно 22.10–28.10: 4 из 8 с датой
            ...calls('2026-10-22', 4, 2),
            ...calls('2026-10-23', 4, 2),
            // текущее окно 29.10–04.11
            ...calls('2026-10-29', 5, 1),
            ...calls('2026-11-03', 5, 1),
        ];
        const result = computePulse(rows, {
            endDate: END,
            calendar: CAL,
            skipDaysWithoutCalls: true,
        });

        expect(result.window.from).toBe('2026-10-22');
        // Окно ушло назад на дни со звонками — прошлого окна в истории нет.
        expect(result.previous).toBeNull();

        const strict = computePulse(rows, { endDate: END, calendar: CAL });
        expect(strict.window.from).toBe('2026-10-29');
        expect(strict.previous).toMatchObject({
            from: '2026-10-22',
            to: '2026-10-28',
            analyzedCalls: 8,
        });
        expect(strict.previous?.nextStepDateRate.value).toBeCloseTo(0.5, 10);
    });

    it('у менеджера — два свежих звонка без даты и свежий с датой', () => {
        const rows = [
            call('2026-11-02', { transcriptionId: 'old-no', nextStep: null }),
            call('2026-11-03', {
                transcriptionId: 'new-no',
                nextStep: { set: true, date: null },
            }),
            call('2026-11-03', {
                transcriptionId: 'mid-no',
                callStartedAt: new Date('2026-11-03T09:00:00+03:00'),
                nextStep: { set: false, date: null },
            }),
            call('2026-11-02', { transcriptionId: 'with-date' }),
            ...calls('2026-10-30', 4),
        ];
        const result = computePulse(rows, {
            endDate: END,
            calendar: CAL,
            managerMinN: 5,
        });
        const row = result.byManager[0];

        expect(row.noDateCallIds).toEqual(['new-no', 'mid-no']);
        expect(row.dateCallId).toBe('with-date');
    });
});
