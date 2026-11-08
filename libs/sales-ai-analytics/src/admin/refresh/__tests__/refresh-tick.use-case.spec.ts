import { newScenario } from '../refresh.plan';
import type { AiRefreshStore } from '../refresh.store';
import type {
    AiRefreshScenario,
    AiRefreshStepCode,
    AiRefreshStepOutcome,
} from '../refresh.types';
import { AiRefreshTickUseCase } from '../refresh-tick.use-case';
import type { AiRefreshStepHandler } from '../steps/refresh-step.types';

const NOW = new Date('2026-11-08T15:00:00.000Z');

class MemoryStore {
    value: AiRefreshScenario | null = null;
    read = jest.fn(() => Promise.resolve(this.value));
    write = jest.fn((scenario: AiRefreshScenario) => {
        this.value = scenario;
        return Promise.resolve();
    });
}

/** Шаг-подделка: старт и проверка отдают заданные исходы. */
const handler = (
    code: AiRefreshStepCode,
    start: AiRefreshStepOutcome,
    probe: AiRefreshStepOutcome = start,
): AiRefreshStepHandler & { start: jest.Mock; probe: jest.Mock } => ({
    code,
    start: jest.fn(() => Promise.resolve(start)),
    probe: jest.fn(() => Promise.resolve(probe)),
});

const make = (handlers: AiRefreshStepHandler[], withReanalysis = false) => {
    const store = new MemoryStore();
    store.value = newScenario(
        {
            id: 's1',
            domain: 'gsr.bitrix24.ru',
            monthKey: '2026-10',
            withReanalysis,
            requestedBy: null,
        },
        NOW,
    );
    const useCase = new AiRefreshTickUseCase(
        store as unknown as AiRefreshStore,
        handlers,
    );
    return { store, useCase };
};

const DONE: AiRefreshStepOutcome = { state: 'done', text: 'ок' };
const RUNNING: AiRefreshStepOutcome = { state: 'running', text: 'идёт' };

describe('AiRefreshTickUseCase — тик сценария', () => {
    it('долгий шаг стартует и ждёт следующего тика; на нём — проверка, потом синхронные шаги подряд', async () => {
        const rebuild = handler('rebuild', RUNNING, DONE);
        const cache = handler('cache', DONE);
        const forecast = handler('forecast', {
            state: 'skipped',
            text: 'не пройдена',
        });
        const report = handler('owner-report', RUNNING);
        const { store, useCase } = make([rebuild, cache, forecast, report]);

        expect(
            await useCase.tick(
                { domain: 'gsr.bitrix24.ru', scenarioId: 's1' },
                NOW,
            ),
        ).toBe(true);
        expect(rebuild.start).toHaveBeenCalledTimes(1);
        expect(cache.start).not.toHaveBeenCalled();
        expect(store.value?.steps[1].state).toBe('running');

        expect(
            await useCase.tick(
                { domain: 'gsr.bitrix24.ru', scenarioId: 's1' },
                NOW,
            ),
        ).toBe(true);
        expect(rebuild.probe).toHaveBeenCalledTimes(1);
        expect(cache.start).toHaveBeenCalledTimes(1);
        expect(forecast.start).toHaveBeenCalledTimes(1);
        expect(report.start).toHaveBeenCalledTimes(1);
        expect(store.value?.steps.map(step => step.state)).toEqual([
            'skipped',
            'done',
            'done',
            'skipped',
            'running',
        ]);
    });

    it('сорвавшийся шаг не останавливает остальные; всё кончилось — тиков больше не нужно', async () => {
        const { store, useCase } = make([
            handler('rebuild', { state: 'error', text: 'упал' }),
            handler('cache', DONE),
            handler('forecast', DONE),
            handler('owner-report', DONE),
        ]);
        expect(
            await useCase.tick(
                { domain: 'gsr.bitrix24.ru', scenarioId: 's1' },
                NOW,
            ),
        ).toBe(false);
        expect(store.value?.finished).toBe(true);
        expect(store.value?.steps[1].state).toBe('error');
    });

    it('чужой id, нет сценария, нет шага в сборке', async () => {
        const { store, useCase } = make([]);
        expect(
            await useCase.tick(
                { domain: 'gsr.bitrix24.ru', scenarioId: 'other' },
                NOW,
            ),
        ).toBe(false);
        expect(store.write).not.toHaveBeenCalled();

        expect(
            await useCase.tick(
                { domain: 'gsr.bitrix24.ru', scenarioId: 's1' },
                NOW,
            ),
        ).toBe(false);
        expect(
            store.value?.steps.slice(1).every(step => step.state === 'error'),
        ).toBe(true);

        store.value = null;
        expect(
            await useCase.tick(
                { domain: 'gsr.bitrix24.ru', scenarioId: 's1' },
                NOW,
            ),
        ).toBe(false);
    });

    it('шаг идёт дольше 8 часов — срыв без вызова проверки', async () => {
        const rebuild = handler('rebuild', RUNNING, RUNNING);
        const { store, useCase } = make([rebuild, handler('cache', RUNNING)]);
        await useCase.tick(
            { domain: 'gsr.bitrix24.ru', scenarioId: 's1' },
            NOW,
        );
        const late = new Date(NOW.getTime() + 9 * 3_600_000);
        await useCase.tick(
            { domain: 'gsr.bitrix24.ru', scenarioId: 's1' },
            late,
        );
        expect(rebuild.probe).not.toHaveBeenCalled();
        expect(store.value?.steps[1]).toMatchObject({ state: 'error' });
        expect(store.value?.steps[2].state).toBe('running');
    });
});
