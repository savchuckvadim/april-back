import {
    PULSE_DEFAULTS,
    PulseCallRow,
    computePulse,
    isAnalyzedCall,
} from '../model/pulse';
import { DEFAULT_WORK_CALENDAR, lastWorkdays } from '../model/workdays.util';

// Сентябрь 2026: 04 — пятница, 05 — суббота, 07–11 — пн–пт.
const END = '2026-09-11';
const WINDOW = ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', END];

type RowPatch = Partial<Omit<PulseCallRow, 'transcriptionId'>>;

let seq = 0;
const row = (day: string, patch: RowPatch = {}): PulseCallRow => {
    seq += 1;
    return {
        transcriptionId: `t${seq}`,
        managerId: 'm1',
        callStartedAt: new Date(`${day}T09:00:00+03:00`),
        durationSec: 600,
        analysisPresent: true,
        nextStep: { set: true, date: '2026-09-15' },
        riskFlags: [],
        coachingPriority: null,
        ...patch,
    };
};

const withDate = (day: string, patch: RowPatch = {}): PulseCallRow =>
    row(day, patch);
const noDate = (day: string, patch: RowPatch = {}): PulseCallRow =>
    row(day, { nextStep: { set: true, date: null }, ...patch });

const options = { endDate: END, calendar: DEFAULT_WORK_CALENDAR };

describe('isAnalyzedCall', () => {
    it('короткий звонок не разобран, длительность null — разобран', () => {
        expect(isAnalyzedCall(row(END, { durationSec: 299 }))).toBe(false);
        expect(isAnalyzedCall(row(END, { durationSec: 300 }))).toBe(true);
        expect(isAnalyzedCall(row(END, { durationSec: null }))).toBe(true);
        expect(isAnalyzedCall(row(END, { analysisPresent: false }))).toBe(
            false,
        );
    });
});

describe('computePulse', () => {
    it('окно — 5 рабочих дней, from/to по краям', () => {
        const result = computePulse([], options);
        expect(result.window).toEqual({
            from: '2026-09-07',
            to: END,
            workdays: WINDOW,
        });
        expect(result.analyzedCalls).toBe(0);
        expect(result.shortCallsSharePct).toBe(0);
        expect(result.nextStepDateRate.value).toBeNull();
        expect(result.xmr).toBeNull();
        expect(result.daily).toEqual([]);
        expect(result.byManager).toEqual([]);
    });

    it('доля считается только по разобранным звонкам окна; короткие не в знаменателе', () => {
        const rows: PulseCallRow[] = [
            // 10 разобранных в окне: 6 с датой, 4 без
            ...Array.from({ length: 6 }, () => withDate('2026-09-08')),
            ...Array.from({ length: 3 }, () => noDate('2026-09-09')),
            noDate('2026-09-10', { nextStep: null }),
            // короткие — с датой, но не считаются
            withDate('2026-09-10', { durationSec: 100 }),
            withDate('2026-09-10', { durationSec: 299 }),
            // без разбора
            withDate(END, { analysisPresent: false }),
            // вне окна: прошлая пятница и суббота после окна
            withDate('2026-09-04'),
            withDate('2026-09-12'),
        ];

        const result = computePulse(rows, options);
        expect(result.analyzedCalls).toBe(10);
        expect(result.nextStepDateRate.n).toBe(10);
        expect(result.nextStepDateRate.value).toBeCloseTo(0.6, 10);
        expect(result.nextStepDateRate.confidence.level).toBe('low');
        // 2 коротких из 13 звонков окна
        expect(result.shortCallsSharePct).toBe(15.4);
    });

    it('nextStep.set без даты и set = false не считаются попаданием', () => {
        const rows = [
            ...Array.from({ length: 8 }, () => withDate('2026-09-08')),
            noDate('2026-09-08'),
            withDate('2026-09-08', {
                nextStep: { set: false, date: '2026-09-20' },
            }),
            withDate('2026-09-08', { nextStep: { set: true, date: '' } }),
        ];
        const result = computePulse(rows, options);
        expect(result.nextStepDateRate.n).toBe(11);
        expect(result.nextStepDateRate.value).toBeCloseTo(8 / 11, 10);
    });

    it('byManager только при analyzed ≥ managerMinN, без null-менеджеров, по managerId', () => {
        const rows = [
            ...Array.from({ length: 6 }, () =>
                withDate('2026-09-08', { managerId: 'm2' }),
            ),
            ...Array.from({ length: 5 }, () =>
                noDate('2026-09-08', { managerId: 'm1' }),
            ),
            ...Array.from({ length: 4 }, () =>
                withDate('2026-09-08', { managerId: 'm3' }),
            ),
            ...Array.from({ length: 5 }, () =>
                withDate('2026-09-08', { managerId: null }),
            ),
            // короткие m2 не увеличивают analyzed
            withDate('2026-09-08', { managerId: 'm2', durationSec: 10 }),
        ];

        expect(computePulse(rows, options).byManager).toEqual([]);
        expect(PULSE_DEFAULTS.managerMinN).toBe(20);

        const result = computePulse(rows, { ...options, managerMinN: 5 });
        expect(result.byManager.map(item => item.managerId)).toEqual([
            'm1',
            'm2',
        ]);
        expect(result.byManager[0].analyzed).toBe(5);
        expect(result.byManager[0].nextStepDateRate.n).toBe(5);
        expect(result.byManager[1].analyzed).toBe(6);
    });

    it('daily — по рабочим дням истории, только дни с разборами, по возрастанию', () => {
        const history = lastWorkdays(
            END,
            PULSE_DEFAULTS.historyWorkdays,
            DEFAULT_WORK_CALENDAR,
        );
        const tooOld = '2026-06-01';
        const rows = [
            withDate(END),
            noDate(END),
            withDate('2026-09-04'),
            withDate(history[0]),
            // суббота — не рабочий день, в daily не попадает
            withDate('2026-09-05'),
            // короткий и неразобранный не создают точку
            withDate('2026-09-09', { durationSec: 5 }),
            withDate('2026-09-10', { analysisPresent: false }),
            withDate(tooOld),
        ];

        const result = computePulse(rows, options);
        const keys = result.daily.map(point => point.key);
        expect(keys).toEqual([history[0], '2026-09-04', END]);
        expect(keys.every(key => history.includes(key))).toBe(true);
        expect(result.daily[2]).toEqual({ key: END, value: 0.5, n: 2 });
        expect(result.xmr).not.toBeNull();
        expect(result.xmr?.center).toBeCloseTo((1 + 1 + 0.5) / 3, 10);
    });

    it('historyWorkdays ограничивает ряд, но не меньше окна', () => {
        const rows = [
            withDate('2026-09-04'),
            withDate(END),
            withDate('2026-09-08'),
        ];
        const short = computePulse(rows, { ...options, historyWorkdays: 1 });
        expect(short.daily.map(point => point.key)).toEqual([
            '2026-09-08',
            END,
        ]);
        expect(short.xmr).toBeNull();
    });

    it('дата звонка берётся в TZ портала', () => {
        // 21:30 UTC 11.09 = 00:30 12.09 по Москве → вне окна
        const late = withDate(END, {
            callStartedAt: new Date('2026-09-11T21:30:00Z'),
        });
        expect(computePulse([late], options).analyzedCalls).toBe(0);
        expect(
            computePulse([late], {
                ...options,
                calendar: { ...DEFAULT_WORK_CALENDAR, timeZone: 'UTC' },
            }).analyzedCalls,
        ).toBe(1);
    });

    it('детерминирован и не зависит от порядка строк', () => {
        const rows = [
            withDate('2026-09-08', { managerId: 'm2' }),
            noDate('2026-09-09'),
            withDate(END, { durationSec: 20 }),
            withDate('2026-09-04'),
        ];
        const forward = computePulse(rows, options);
        const backward = computePulse([...rows].reverse(), options);
        expect(backward).toEqual(forward);
        expect(computePulse(rows, options)).toEqual(forward);
    });
});
