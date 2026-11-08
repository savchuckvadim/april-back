import {
    applyOutcome,
    currentStep,
    lastClosedMonthKey,
    monthBounds,
    newScenario,
    scenarioAbandoned,
    stepTimedOut,
} from '../refresh.plan';
import { parseAiRefreshScenario } from '../refresh.store';

const NOW = new Date('2026-11-08T15:00:00.000Z');
const later = (minutes: number): Date =>
    new Date(NOW.getTime() + minutes * 60_000);

const scenario = (withReanalysis = true) =>
    newScenario(
        {
            id: 's1',
            domain: 'gsr.bitrix24.ru',
            monthKey: '2026-10',
            withReanalysis,
            requestedBy: null,
        },
        NOW,
    );

describe('сценарий «обновить всё»: чистая логика', () => {
    it('границы месяца и последний закрытый месяц', () => {
        expect(monthBounds('2026-10')).toEqual({
            from: '2026-10-01',
            to: '2026-10-31',
        });
        expect(monthBounds('2024-02')).toEqual({
            from: '2024-02-01',
            to: '2024-02-29',
        });
        expect(lastClosedMonthKey(NOW)).toBe('2026-10');
        expect(lastClosedMonthKey(new Date('2026-01-05T00:00:00Z'))).toBe(
            '2025-12',
        );
    });

    it('новый сценарий: пять шагов по порядку; без переразбора первый пропущен', () => {
        const full = scenario();
        expect(full.steps.map(step => step.code)).toEqual([
            'reanalyze',
            'rebuild',
            'cache',
            'forecast',
            'owner-report',
        ]);
        expect(full.steps.every(step => step.state === 'pending')).toBe(true);
        expect(currentStep(full)?.code).toBe('reanalyze');

        const short = scenario(false);
        expect(short.steps[0].state).toBe('skipped');
        expect(currentStep(short)?.code).toBe('rebuild');
    });

    it('исход шага: старт ставит начало, смена фазы — новое начало, конец — finishedAt; всё сделано — finished', () => {
        let s = applyOutcome(
            scenario(),
            'reanalyze',
            { state: 'running', phase: 'count', text: 'считаю' },
            NOW,
        );
        expect(s.steps[0]).toMatchObject({
            state: 'running',
            phase: 'count',
            startedAt: NOW.toISOString(),
            finishedAt: null,
        });
        s = applyOutcome(
            s,
            'reanalyze',
            { state: 'running', text: 'всё ещё считаю' },
            later(1),
        );
        expect(s.steps[0].startedAt).toBe(NOW.toISOString());
        s = applyOutcome(
            s,
            'reanalyze',
            { state: 'running', phase: 'run', text: 'запущен' },
            later(2),
        );
        expect(s.steps[0].startedAt).toBe(later(2).toISOString());

        for (const code of [
            'reanalyze',
            'rebuild',
            'cache',
            'forecast',
            'owner-report',
        ] as const) {
            s = applyOutcome(s, code, { state: 'done', text: 'ок' }, later(3));
        }
        expect(s.finished).toBe(true);
        expect(currentStep(s)).toBeNull();
    });

    it('срыв по времени и брошенный сценарий', () => {
        const running = applyOutcome(
            scenario(),
            'reanalyze',
            { state: 'running', text: 'идёт' },
            NOW,
        );
        expect(stepTimedOut(running.steps[0], later(60))).toBe(false);
        expect(stepTimedOut(running.steps[0], later(9 * 60))).toBe(true);
        expect(stepTimedOut(running.steps[1], later(9 * 60))).toBe(false);

        expect(scenarioAbandoned(running, later(5))).toBe(false);
        expect(scenarioAbandoned(running, later(30))).toBe(true);
        expect(
            scenarioAbandoned({ ...running, finished: true }, later(30)),
        ).toBe(false);
    });

    it('Redis: своя форма читается, чужая и битая — null', () => {
        const s = scenario();
        expect(parseAiRefreshScenario(JSON.stringify(s))).toEqual(s);
        expect(parseAiRefreshScenario(null)).toBeNull();
        expect(parseAiRefreshScenario('{oops')).toBeNull();
        expect(
            parseAiRefreshScenario(
                JSON.stringify({ ...s, steps: [{ code: 'x' }] }),
            ),
        ).toBeNull();
    });
});
