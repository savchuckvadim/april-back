import 'reflect-metadata';
import { DEFAULT_WORK_CALENDAR } from '@lib/sales-ai-analytics';
import type { ManagerPassport } from '@lib/sales-ai-analytics';
import { AI_PIPELINE_BUS_KEYS } from '../constants/ai-snapshot.const';
import { AI_PASSPORT_SKIP_REASONS } from '../constants/ai-passport.const';
import { ManagerPassportLoader } from '../domain/loaders/manager-passport.loader';
import {
    firstEventsFromCalls,
    firstEventsFromMonths,
    mergeFirstEvents,
    PassportStep,
} from '../steps/passport.step';
import { createStepBus } from '../steps/step.types';
import type { AiPipelineStepContext, StepBus } from '../steps/step.types';

const DOMAIN = 'a.bitrix24.ru';
const NOW = new Date('2026-09-08T00:45:00Z');

type BxUserRow = Record<string, unknown>;

/** Снапшот менеджер-месяца в объёме, который читает шаг. */
interface MonthRecord {
    managerId: string | null;
    periodKey: string;
}

interface StepCase {
    users?: BxUserRow[];
    ids?: number[];
    months?: MonthRecord[];
    fails?: boolean;
}

function makeStep(options: StepCase = {}) {
    const userGet = jest.fn(() =>
        options.fails
            ? Promise.reject(new Error('ACCESS_DENIED'))
            : Promise.resolve({ result: options.users ?? [] }),
    );
    const pbx = {
        init: jest
            .fn()
            .mockResolvedValue({ bitrix: { user: { get: userGet } } }),
    };
    const settings = {
        load: jest.fn().mockResolvedValue({
            calendar: DEFAULT_WORK_CALENDAR,
            levels: [],
            absences: {},
        }),
    };
    const store: Record<string, unknown> = {};
    const cache = {
        getJson: jest.fn((key: string) => Promise.resolve(store[key] ?? null)),
        setJson: jest.fn((key: string, value: unknown) => {
            store[key] = value;
            return Promise.resolve();
        }),
    };
    const managers = {
        resolve: jest.fn().mockResolvedValue(options.ids ?? [10]),
    };
    const snapshots = {
        findByKeys: jest.fn().mockResolvedValue(options.months ?? []),
    };
    const loader = new ManagerPassportLoader(
        pbx as never,
        settings as never,
        cache as never,
        managers as never,
    );

    return {
        step: new PassportStep(loader, snapshots as never),
        userGet,
        snapshots,
    };
}

/** Контекст прогона в объёме, который читает шаг. */
function makeContext(
    overrides: Partial<AiPipelineStepContext> = {},
): AiPipelineStepContext {
    return {
        domain: DOMAIN,
        rhythm: 'nightly',
        day: '2026-09-08',
        weekKey: '2026-W37',
        monthKey: '2026-09',
        timeZone: 'Europe/Moscow',
        calendar: DEFAULT_WORK_CALENDAR,
        settings: { calendar: DEFAULT_WORK_CALENDAR, levels: [], absences: {} },
        registry: {},
        paramsVersion: 'pv-1',
        calcVersion: 'sam-1.0.0',
        comparableFrom: '',
        inputsHash: 'hash',
        managerIds: [10],
        now: NOW,
        forceRefresh: false,
        ...overrides,
    } as AiPipelineStepContext;
}

const passportsOf = (bus: StepBus): ManagerPassport[] =>
    bus.get<ManagerPassport[]>(AI_PIPELINE_BUS_KEYS.passport) ?? [];

describe('PassportStep — паспорта в шине конвейера', () => {
    it('кладёт паспорта под ключом passport и не ходит за прокси', async () => {
        const { step, snapshots } = makeStep({
            users: [
                { ID: '10', ACTIVE: true, UF_EMPLOYMENT_DATE: '2026-03-01' },
            ],
        });
        const bus = createStepBus();

        const result = await step.run(makeContext(), bus);

        expect(result.status).toBe('ok');
        expect(result.rows).toBe(1);
        expect(result.bitrixCalls).toBe(1);
        expect(passportsOf(bus)[0]).toMatchObject({
            managerId: '10',
            sinceSource: 'employment',
            tenureBand: '6-18',
        });
        expect(snapshots.findByKeys).not.toHaveBeenCalled();
    });

    it('ритмы шага — ночной, недельный, месячный и догон (паспорт из кэша)', () => {
        const { step } = makeStep();

        // Догон истории тоже получает паспорт: без него у догнанных месяцев
        // `tenureBand: null`. В ритме `backfill` паспорт берётся из кэша
        // `user.get`, лишнего похода в портал за каждый месяц не будет.
        expect([...step.rhythms]).toEqual([
            'nightly',
            'weekly',
            'monthly',
            'backfill',
        ]);
        expect(step.code).toBe('passport');
    });

    it('нет дат портала → прокси по первому звонку из шины', async () => {
        const { step, userGet } = makeStep({ users: [{ ID: '10' }] });
        const bus = createStepBus();
        bus.set(AI_PIPELINE_BUS_KEYS.callsRows, [
            {
                managerId: '10',
                callStartedAt: new Date('2026-05-20T09:00:00Z'),
            },
            {
                managerId: '10',
                callStartedAt: new Date('2026-02-15T09:00:00Z'),
            },
        ]);

        const result = await step.run(makeContext(), bus);

        expect(passportsOf(bus)[0]).toMatchObject({
            since: '2026-02-15',
            sinceSource: 'proxy',
        });
        // Второй проход берёт факты из кэша: лишних вызовов Bitrix нет.
        expect(userGet).toHaveBeenCalledTimes(1);
        expect(result.bitrixCalls).toBe(1);
    });

    it('шина пуста → прокси по первому месяцу отчётности', async () => {
        const { step, snapshots } = makeStep({
            users: [{ ID: '10' }],
            months: [
                { managerId: '10', periodKey: '2026-05' },
                { managerId: '10', periodKey: '2026-03' },
                { managerId: null, periodKey: '2026-01' },
            ],
        });
        const bus = createStepBus();

        await step.run(makeContext(), bus);

        expect(snapshots.findByKeys).toHaveBeenCalledTimes(1);
        expect(passportsOf(bus)[0]).toMatchObject({
            since: '2026-03-01',
            sinceSource: 'proxy',
        });
    });

    it('прокси не нашёлся — паспорт без даты, шаг не падает', async () => {
        const { step } = makeStep({ users: [{ ID: '10' }] });
        const bus = createStepBus();

        const result = await step.run(makeContext(), bus);

        expect(result.status).toBe('ok');
        expect(passportsOf(bus)[0]).toMatchObject({
            since: null,
            sinceSource: null,
            tenureBand: null,
        });
    });

    it('пустой ростер → пропуск с причиной, шина не заполняется', async () => {
        const { step } = makeStep({ ids: [] });
        const bus = createStepBus();

        const result = await step.run(makeContext({ managerIds: [] }), bus);

        expect(result.status).toBe('skipped');
        expect(result.reason).toBe(AI_PASSPORT_SKIP_REASONS.noRoster);
        expect(bus.get(AI_PIPELINE_BUS_KEYS.passport)).toBeUndefined();
    });

    it('портал не отдал пользователей → пропуск, но паспорта в шине есть', async () => {
        const { step } = makeStep({ fails: true });
        const bus = createStepBus();

        const result = await step.run(makeContext(), bus);

        expect(result.status).toBe('skipped');
        expect(result.reason).toBe(AI_PASSPORT_SKIP_REASONS.noUsers);
        expect(passportsOf(bus)).toHaveLength(1);
    });
});

describe('Источники прокси-события', () => {
    it('firstEventsFromCalls — минимальная дата на менеджера', () => {
        expect(
            firstEventsFromCalls([
                { managerId: 10, callStartedAt: '2026-05-20T09:00:00Z' },
                { managerId: '10', callStartedAt: new Date('2026-02-15') },
                { managerId: '11', callStartedAt: null },
                'мусор',
            ]),
        ).toEqual({ '10': '2026-02-15' });
    });

    it('firstEventsFromCalls — чужая форма шины даёт пусто', () => {
        expect(firstEventsFromCalls(undefined)).toEqual({});
        expect(firstEventsFromCalls({ rows: [] })).toEqual({});
    });

    it('firstEventsFromMonths — первое число самого раннего месяца', () => {
        expect(
            firstEventsFromMonths([
                { managerId: '10', periodKey: '2026-05' },
                { managerId: '10', periodKey: '2026-03' },
                { managerId: null, periodKey: '2026-01' },
            ]),
        ).toEqual({ '10': '2026-03-01' });
    });

    it('mergeFirstEvents — побеждает ранняя дата', () => {
        expect(
            mergeFirstEvents(
                { '10': '2026-03-01', '11': '2026-04-01' },
                { '10': '2026-01-15' },
            ),
        ).toEqual({ '10': '2026-01-15', '11': '2026-04-01' });
    });
});
