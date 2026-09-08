/**
 * Шаг конвейера «история стадий» (план Фазы 2, поток 13): раскладка
 * результатов сборки по шине, штатный пропуск без прав и на короткой
 * истории, идемпотентность повтора за тот же день и ритмы шага.
 */
import 'reflect-metadata';
import {
    AI_ANALYTICS_SNAPSHOT_TYPE,
    DEFAULT_WORK_CALENDAR,
    type CallLink,
    type DealEpisode,
    type StageTheta,
    type TimestampLeakResult,
} from '@lib/sales-ai-analytics';
import { PBX_DEAL_SALES_BASE_STAGE_CODE } from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import { AI_PIPELINE_BUS_KEYS } from '../constants/ai-snapshot.const';
import {
    AI_STAGE_HISTORY_RHYTHMS,
    AI_STAGE_HISTORY_SKIP_REASONS,
    AI_STAGE_HISTORY_STEP_CODE,
} from '../constants/ai-stage-history.const';
import type { EpisodesChain } from '../domain/assembler/episodes.assembler';
import type { CallEntityLoader } from '../domain/loaders/call-entity.loader';
import type {
    StageHistoryLoader,
    StageHistoryResult,
} from '../domain/loaders/stage-history.loader';
import { toStageTransitions } from '../domain/loaders/stage-history.mapper';
import type { AiAnalyticsSnapshotStore } from '../store/ai-analytics-snapshot.store';
import { StageHistoryStep } from '../steps/stage-history.step';
import {
    createStepBus,
    type AiPipelineStepContext,
    type StepBus,
} from '../steps/step.types';
import {
    REOPENED_SALE_ITEMS,
    STAGE_HISTORY_ITEMS,
    stageHistoryPortal,
} from './fixtures/stage-history.fixture';

const DOMAIN = 'a.bitrix24.ru';
const NOW = new Date('2026-09-01T07:00:00Z');
const STAGE = PBX_DEAL_SALES_BASE_STAGE_CODE;

const TRANSITIONS = toStageTransitions(
    [...STAGE_HISTORY_ITEMS, ...REOPENED_SALE_ITEMS],
    stageHistoryPortal(),
);

/** Короткая история: один месяц переходов — меньше гейта в три месяца. */
const SHORT_TRANSITIONS = TRANSITIONS.filter(transition =>
    transition.at.startsWith('2026-06'),
);

function loaded(
    overrides: Partial<StageHistoryResult> = {},
): StageHistoryResult {
    return {
        transitions: TRANSITIONS,
        rows: TRANSITIONS.length,
        bitrixCalls: 2,
        truncated: false,
        ok: true,
        reason: null,
        error: null,
        lastId: 15,
        fromCache: false,
        ...overrides,
    };
}

function makeStep(
    result: StageHistoryResult,
    model: Record<string, unknown> | null = null,
) {
    const load = jest.fn().mockResolvedValue(result);
    const entities = jest.fn().mockResolvedValue(new Map());
    const latest = jest
        .fn()
        .mockResolvedValue(model === null ? null : { payload: model });
    const step = new StageHistoryStep(
        { load } as unknown as StageHistoryLoader,
        { load: entities } as unknown as CallEntityLoader,
        { latest } as unknown as AiAnalyticsSnapshotStore,
    );

    return { step, load, entities, latest };
}

function makeCtx(
    overrides: Partial<AiPipelineStepContext> = {},
): AiPipelineStepContext {
    return {
        domain: DOMAIN,
        rhythm: 'nightly',
        day: '2026-09-01',
        weekKey: '2026-W36',
        monthKey: '2026-09',
        timeZone: 'Europe/Moscow',
        calendar: DEFAULT_WORK_CALENDAR,
        settings: {},
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

/** Строки звонков в шине — форма lite-выборки call-lib. */
function busWithCalls(bus: StepBus, count: number): void {
    bus.set(
        AI_PIPELINE_BUS_KEYS.callsRows,
        Array.from({ length: count }, (_, index) => ({
            transcriptionId: String(index + 1),
            managerId: '10',
            callStartedAt: new Date('2026-06-02T09:00:00Z'),
        })),
    );
}

describe('StageHistoryStep: контракт шага', () => {
    it('код и ритмы: ночной пересчёт, месяц и backfill', () => {
        const { step } = makeStep(loaded());

        expect(step.code).toBe(AI_STAGE_HISTORY_STEP_CODE);
        expect(step.rhythms).toEqual(AI_STAGE_HISTORY_RHYTHMS);
        expect(step.rhythms).not.toContain('weekly');
    });

    it('грузит окно в двенадцать месяцев от дня прогона', async () => {
        const { step, load } = makeStep(loaded());

        await step.run(makeCtx(), createStepBus());

        expect(load).toHaveBeenCalledWith(DOMAIN, {
            fromDate: '2025-09-01',
            toDate: '2026-09-01',
            forceRefresh: false,
        });
    });
});

describe('StageHistoryStep: результаты в шине', () => {
    it('кладёт эпизоды, сцепку, θ, медиану цикла, сроки и протечку', async () => {
        const { step } = makeStep(loaded());
        const bus = createStepBus();

        const result = await step.run(makeCtx(), bus);

        expect(result).toMatchObject({
            step: AI_STAGE_HISTORY_STEP_CODE,
            status: 'ok',
            rows: TRANSITIONS.length,
            bitrixCalls: 2,
            written: 0,
        });
        const episodes = bus.get<DealEpisode[]>(AI_PIPELINE_BUS_KEYS.episodes);
        expect(episodes).toHaveLength(12);
        expect(
            bus.get<StageTheta[]>(AI_PIPELINE_BUS_KEYS.stageTheta)?.[0],
        ).toMatchObject({ stageCode: STAGE.new, order: 1 });
        expect(
            bus.get<Record<string, { p50: number }>>(
                AI_PIPELINE_BUS_KEYS.slaFacts,
            )?.[STAGE.presentation]?.p50,
        ).toBeGreaterThan(0);
        expect(
            bus.get<TimestampLeakResult>(AI_PIPELINE_BUS_KEYS.timestampLeak)
                ?.leaked,
        ).toBe(1);
        expect(
            bus.get<number>(AI_PIPELINE_BUS_KEYS.historyMonths),
        ).toBeGreaterThan(3);
        expect(bus.get<number>(AI_PIPELINE_BUS_KEYS.cycleMedian)).toBe(28);
    });

    it('сцепляет звонки шины по сущностям из ais', async () => {
        const { step, entities } = makeStep(loaded());
        entities.mockResolvedValue(
            new Map([
                [
                    '1',
                    {
                        transcriptionId: '1',
                        entityType: 'deal' as const,
                        entityId: '101',
                    },
                ],
            ]),
        );
        const bus = createStepBus();
        busWithCalls(bus, 2);

        await step.run(makeCtx(), bus);

        expect(entities).toHaveBeenCalledWith(DOMAIN, ['1', '2']);
        const chain = bus.get<EpisodesChain>(AI_PIPELINE_BUS_KEYS.chain);
        expect(chain?.links).toHaveLength(2);
        expect(chain?.linked).toBe(1);
        expect(chain?.sharePct).toBe(50);
        expect(chain?.estimand.estimand).toBe('rate');
    });

    it('звонок без записи разбора остаётся в знаменателе доли сцепки', async () => {
        const { step } = makeStep(loaded());
        const bus = createStepBus();
        busWithCalls(bus, 4);

        await step.run(makeCtx(), bus);

        const chain = bus.get<EpisodesChain>(AI_PIPELINE_BUS_KEYS.chain);
        expect(chain?.links).toHaveLength(4);
        expect(chain?.linked).toBe(0);
        expect(chain?.sharePct).toBe(0);
    });

    it('гистерезис держит вероятность, пока доля сцепки не ниже 70', async () => {
        const { step, entities } = makeStep(loaded(), { edgeKind: 'prob' });
        entities.mockResolvedValue(
            new Map(
                Array.from({ length: 7 }, (_, index) => [
                    String(index + 1),
                    {
                        transcriptionId: String(index + 1),
                        entityType: 'deal' as const,
                        entityId: '101',
                    },
                ]),
            ),
        );
        const bus = createStepBus();
        busWithCalls(bus, 10);

        await step.run(makeCtx(), bus);

        const chain = bus.get<EpisodesChain>(AI_PIPELINE_BUS_KEYS.chain);
        expect(chain?.sharePct).toBe(70);
        expect(chain?.estimand).toMatchObject({
            estimand: 'prob',
            switched: false,
            reason: 'chain-hold',
        });
        expect(
            (chain?.links ?? []).filter(
                (link: CallLink) => link.episodeKey === null,
            ),
        ).toHaveLength(3);
    });

    it('читает прошлую трактовку ребра из снапшота модели портала', async () => {
        const { step, latest } = makeStep(loaded(), { edgeKind: 'prob' });

        await step.run(makeCtx(), createStepBus());

        expect(latest).toHaveBeenCalledWith(
            DOMAIN,
            AI_ANALYTICS_SNAPSHOT_TYPE.portalModel,
            null,
        );
    });
});

describe('StageHistoryStep: штатная деградация', () => {
    it('нет прав на метод — skipped с причиной, конвейер не падает', async () => {
        const { step } = makeStep(
            loaded({
                ok: false,
                reason: AI_STAGE_HISTORY_SKIP_REASONS.unavailable,
                error: 'ACCESS_DENIED',
                transitions: [],
                rows: 0,
                bitrixCalls: 1,
            }),
        );
        const bus = createStepBus();

        const result = await step.run(makeCtx(), bus);

        expect(result).toMatchObject({
            status: 'skipped',
            reason: AI_STAGE_HISTORY_SKIP_REASONS.unavailable,
            written: 0,
        });
        expect(bus.get<number>(AI_PIPELINE_BUS_KEYS.historyMonths)).toBe(0);
        expect(bus.get(AI_PIPELINE_BUS_KEYS.episodes)).toBeUndefined();
        expect(bus.get(AI_PIPELINE_BUS_KEYS.chain)).toBeUndefined();
    });

    it('история короче трёх месяцев — skipped: stage-history-too-short', async () => {
        const { step } = makeStep(
            loaded({
                transitions: SHORT_TRANSITIONS,
                rows: SHORT_TRANSITIONS.length,
            }),
        );
        const bus = createStepBus();

        const result = await step.run(makeCtx(), bus);

        expect(result).toMatchObject({
            status: 'skipped',
            reason: AI_STAGE_HISTORY_SKIP_REASONS.tooShort,
        });
        const months = bus.get<number>(AI_PIPELINE_BUS_KEYS.historyMonths);
        expect(months).toBeLessThan(3);
        expect(bus.get(AI_PIPELINE_BUS_KEYS.episodes)).toBeUndefined();
        expect(bus.get(AI_PIPELINE_BUS_KEYS.stageTheta)).toBeUndefined();
    });

    it('воронка не настроена — skipped с причиной, без исключения', async () => {
        const { step } = makeStep(
            loaded({
                ok: false,
                reason: AI_STAGE_HISTORY_SKIP_REASONS.noCategory,
                transitions: [],
                rows: 0,
                bitrixCalls: 0,
            }),
        );

        await expect(
            step.run(makeCtx(), createStepBus()),
        ).resolves.toMatchObject({
            status: 'skipped',
            reason: AI_STAGE_HISTORY_SKIP_REASONS.noCategory,
        });
    });
});

describe('StageHistoryStep: идемпотентность повтора', () => {
    it('повтор за тот же день не удваивает вызовы и не пишет снапшоты', async () => {
        const { step, load } = makeStep(loaded());
        load.mockResolvedValueOnce(loaded()).mockResolvedValueOnce(
            loaded({ fromCache: true, bitrixCalls: 0 }),
        );
        const ctx = makeCtx();

        const first = await step.run(ctx, createStepBus());
        const bus = createStepBus();
        const second = await step.run(ctx, bus);

        expect(first.bitrixCalls).toBe(2);
        expect(second.bitrixCalls).toBe(0);
        expect(first.written).toBe(0);
        expect(second.written).toBe(0);
        expect(load).toHaveBeenCalledTimes(2);
        expect(load.mock.calls[0]).toEqual(load.mock.calls[1]);
        expect(
            bus.get<DealEpisode[]>(AI_PIPELINE_BUS_KEYS.episodes),
        ).toHaveLength(12);
    });

    it('forceRefresh прогона доходит до загрузчика', async () => {
        const { step, load } = makeStep(loaded());

        await step.run(makeCtx({ forceRefresh: true }), createStepBus());

        expect(load).toHaveBeenCalledWith(
            DOMAIN,
            expect.objectContaining({ forceRefresh: true }),
        );
    });
});
