/**
 * Контракт шины конвейера «stage-history пишет → finance / portal-model /
 * forecast / sanity читают» на РЕАЛЬНОЙ форме писателя (аудит Фазы 2, B1:
 * читатели ключа `chain` ждали число или `chainSharePct`, а писатель клал
 * `EpisodesChain{sharePct,…}` — доля сцепки всегда была 0).
 *
 * В шину здесь никто ничего не подкладывает руками: `StageHistoryStep`
 * прогоняется с моками загрузчиков на фикстуре переходов, и всё, что он
 * положил, читается штатными читателями — `readChainSharePct` (финансы),
 * `portalModelFacts` (модель портала), `managerByEpisodeKey` (прогноз),
 * `slaFacts`/`leakFactOf` и сам `SanityStep` (панель). Ожидания — формулой
 * от фикстуры, не числами.
 */
import 'reflect-metadata';
import {
    DEFAULT_WORK_CALENDAR,
    saleLags,
    type DealEpisode,
    type StageTheta,
    type TimestampLeakResult,
} from '@lib/sales-ai-analytics';
import { PBX_DEAL_SALES_BASE_STAGE_CODE } from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import { AI_PIPELINE_BUS_KEYS } from '../constants/ai-snapshot.const';
import { readChainSharePct } from '../domain/assembler/bus-facts.util';
import type { EpisodesChain } from '../domain/assembler/episodes.assembler';
import type { CallEntityLoader } from '../domain/loaders/call-entity.loader';
import type {
    StageHistoryLoader,
    StageHistoryResult,
} from '../domain/loaders/stage-history.loader';
import { toStageTransitions } from '../domain/loaders/stage-history.mapper';
import type { AiAnalyticsSnapshotStore } from '../store/ai-analytics-snapshot.store';
import { managerByEpisodeKey } from '../steps/portal-model.facts';
import { portalModelFacts } from '../steps/portal-model.step';
import { slaFacts } from '../steps/sanity.facts';
import { slaRule } from '../steps/sanity.rules';
import { leakFactOf } from '../steps/sanity.sources';
import { SanityStep } from '../steps/sanity.step';
import {
    AI_SANITY_DATA_QUALITY,
    AI_SANITY_RULES,
    type AiSanityReport,
} from '../steps/sanity.types';
import { StageHistoryStep } from '../steps/stage-history.step';
import {
    createStepBus,
    type AiPipelineStepContext,
    type StepBus,
} from '../steps/step.types';
import {
    REOPENED_SALE_ITEMS,
    STAGE_HISTORY_ITEMS,
    stageHistoryItem,
    stageHistoryPortal,
} from './fixtures/stage-history.fixture';

const DOMAIN = 'a.bitrix24.ru';
const NOW = new Date('2026-09-01T07:00:00Z');
const MANAGER_ID = '10';
const STAGE = PBX_DEAL_SALES_BASE_STAGE_CODE;
const PERCENT = 100;

/** Сделка фикстуры, в которую сцепляются звонки (продана 10.06). */
const LINKED_DEAL = '101';

/** Звонков в шине и сколько из них знают свою сделку из `ais`. */
const CALLS_TOTAL = 4;
const CALLS_WITH_ENTITY = 2;

/**
 * Нижняя граница `n_min_none` в реестре (диапазон [5; 15]): меньше
 * резолвер не примет. Продаж в истории должно быть не меньше, иначе
 * плацебо-тест молчит по правилу «ложная тревога хуже молчания».
 */
const MIN_OBSERVATIONS = 5;

/** Ещё четыре честные продажи (без протечки) — чтобы набрать порог. */
const EXTRA_SOLD_ITEMS = [106, 107, 108, 109].flatMap((deal, index) => {
    const month = String(5 + (index % 3)).padStart(2, '0');
    return [
        stageHistoryItem(deal, STAGE.new, `2026-${month}-02T10:00:00+03:00`),
        stageHistoryItem(
            deal,
            STAGE.presentation,
            `2026-${month}-06T10:00:00+03:00`,
        ),
        stageHistoryItem(
            deal,
            STAGE.success,
            `2026-${month}-20T10:00:00+03:00`,
        ),
    ];
});

const ITEMS = [
    ...STAGE_HISTORY_ITEMS,
    ...REOPENED_SALE_ITEMS,
    ...EXTRA_SOLD_ITEMS,
];

const TRANSITIONS = toStageTransitions(ITEMS, stageHistoryPortal());

/** Продажи истории: успешные сделки, одна из них (105) с протечкой. */
const FIXTURE_SALES = new Set(
    ITEMS.filter(item => item.STAGE_SEMANTIC_ID === 'S').map(
        item => item.OWNER_ID,
    ),
).size;
const FIXTURE_LEAKED_SALES = 1;

function loaded(): StageHistoryResult {
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
    };
}

/** Шаг истории стадий с моками: история из фикстуры, сущности из `ais`. */
function makeStageHistoryStep(): StageHistoryStep {
    const refs = new Map(
        Array.from({ length: CALLS_WITH_ENTITY }, (unused, index) => [
            String(index + 1),
            {
                transcriptionId: String(index + 1),
                entityType: 'deal' as const,
                entityId: LINKED_DEAL,
            },
        ]),
    );
    return new StageHistoryStep(
        {
            load: jest.fn().mockResolvedValue(loaded()),
        } as unknown as StageHistoryLoader,
        {
            load: jest.fn().mockResolvedValue(refs),
        } as unknown as CallEntityLoader,
        {
            latest: jest.fn().mockResolvedValue(null),
        } as unknown as AiAnalyticsSnapshotStore,
    );
}

/** Стор глазами панели: один менеджер-месяц с прокси-экспозицией. */
function makeSanityStep(): SanityStep {
    return new SanityStep({
        findByKeys: jest.fn().mockResolvedValue([
            {
                managerId: MANAGER_ID,
                payload: {
                    level: 'middle',
                    finance: { salesCount: 4 },
                    exposure: { daysSource: 'proxy' },
                },
            },
        ]),
    } as unknown as AiAnalyticsSnapshotStore);
}

function makeCtx(): AiPipelineStepContext {
    return {
        domain: DOMAIN,
        rhythm: 'weekly',
        day: '2026-09-01',
        weekKey: '2026-W36',
        monthKey: '2026-09',
        timeZone: 'Europe/Moscow',
        calendar: DEFAULT_WORK_CALENDAR,
        settings: {
            targets: { byLevel: {}, overrides: {} },
            modelParams: {},
            definitions: { minDurationSecByType: {} },
        },
        // Порог наблюдений — минимум реестра: проверяется форма значений
        // шины, а не статистика.
        registry: { portal: { n_min_none: MIN_OBSERVATIONS } },
        paramsVersion: 'pv-1',
        calcVersion: 'sam-1.0.0',
        comparableFrom: '',
        inputsHash: 'hash',
        managerIds: [Number(MANAGER_ID)],
        now: NOW,
        forceRefresh: false,
    } as unknown as AiPipelineStepContext;
}

/** Строки звонков шага звонков: все звонки в день жизни сделки 101. */
function withCalls(bus: StepBus): void {
    bus.set(
        AI_PIPELINE_BUS_KEYS.callsRows,
        Array.from({ length: CALLS_TOTAL }, (unused, index) => ({
            transcriptionId: String(index + 1),
            managerId: MANAGER_ID,
            callStartedAt: new Date('2026-06-02T09:00:00Z'),
        })),
    );
}

/** Шина после реального прогона шага истории стадий. */
async function runStageHistory(): Promise<{
    bus: StepBus;
    ctx: AiPipelineStepContext;
    chain: EpisodesChain;
}> {
    const bus = createStepBus();
    const ctx = makeCtx();
    withCalls(bus);
    const result = await makeStageHistoryStep().run(ctx, bus);
    expect(result.status).toBe('ok');
    const chain = bus.get<EpisodesChain>(AI_PIPELINE_BUS_KEYS.chain);
    if (chain === undefined) throw new Error('шаг не положил ключ chain');
    return { bus, ctx, chain };
}

const EXPECTED_SHARE_PCT = (CALLS_WITH_ENTITY / CALLS_TOTAL) * PERCENT;

describe('Контракт шины: ключ chain (stage-history → finance / portal-model)', () => {
    it('писатель кладёт EpisodesChain, доля — в sharePct по формуле сцепки', async () => {
        const { chain } = await runStageHistory();

        expect(chain.links).toHaveLength(CALLS_TOTAL);
        expect(chain.linked).toBe(CALLS_WITH_ENTITY);
        expect(chain.sharePct).toBe(EXPECTED_SHARE_PCT);
        expect(chain.estimand.estimand).toBe('rate');
    });

    it('финансы читают ту же долю тем же читателем — не 0', async () => {
        const { bus, chain } = await runStageHistory();

        const shared = readChainSharePct(bus.get(AI_PIPELINE_BUS_KEYS.chain));

        expect(shared).toBe(chain.sharePct);
        expect(shared).toBe(EXPECTED_SHARE_PCT);
    });

    it('модель портала читает долю, трактовку ребра и θ из формы писателя', async () => {
        const { bus, ctx, chain } = await runStageHistory();

        const facts = portalModelFacts(ctx, bus);

        expect(facts.chainSharePct).toBe(chain.sharePct);
        expect(facts.edgeKind).toBe(chain.estimand.estimand);
        expect(facts.edgeKindReason).toBe(chain.estimand.reason);
        expect(facts.cycleMedianDays).toBe(
            bus.get<number>(AI_PIPELINE_BUS_KEYS.cycleMedian),
        );
        expect(facts.historyMonths).toBe(
            bus.get<number>(AI_PIPELINE_BUS_KEYS.historyMonths),
        );
        expect(facts.stageThetas).toEqual(
            bus.get<StageTheta[]>(AI_PIPELINE_BUS_KEYS.stageTheta),
        );
        // Лаги продаж модель считает библиотекой по эпизодам шины —
        // открытые эпизоды идут цензурированными точками.
        const episodes =
            bus.get<DealEpisode[]>(AI_PIPELINE_BUS_KEYS.episodes) ?? [];
        expect(facts.saleLags).toEqual(
            saleLags(episodes, { includeOpen: true }),
        );
        expect(facts.saleLags?.length).toBeGreaterThan(0);
    });

    it('прогноз находит менеджера эпизода по сцепке звонков', async () => {
        const { bus, chain } = await runStageHistory();
        const linkedKeys = new Set(
            chain.links.flatMap(link => link.episodeKey ?? []),
        );

        const byEpisode = managerByEpisodeKey(
            bus.get(AI_PIPELINE_BUS_KEYS.chain),
            bus.get(AI_PIPELINE_BUS_KEYS.callsRows),
        );

        expect(linkedKeys.size).toBeGreaterThan(0);
        expect([...byEpisode.keys()].sort()).toEqual([...linkedKeys].sort());
        expect([...byEpisode.values()]).toEqual(
            Array.from(linkedKeys, () => MANAGER_ID),
        );
    });
});

describe('Контракт шины: slaFacts и timestampLeak (stage-history → sanity)', () => {
    it('факты сроков стадий доходят до правила SLA в форме писателя', async () => {
        const { bus } = await runStageHistory();
        const closedPresentations = bus
            .get<DealEpisode[]>(AI_PIPELINE_BUS_KEYS.episodes)
            ?.filter(
                episode =>
                    episode.stageCode === STAGE.presentation &&
                    episode.endedAt !== null,
            ).length;

        const facts = slaFacts(bus.get(AI_PIPELINE_BUS_KEYS.slaFacts));
        const rule = slaRule({ [STAGE.presentation]: 1 }, facts, 1);

        expect(facts[STAGE.presentation]?.n).toBe(closedPresentations);
        expect(facts[STAGE.presentation]?.p50).toBeGreaterThan(1);
        expect(rule.status).toBe('warning');
    });

    it('плацебо-тест доходит до панели и её готовности (dq-гейт)', async () => {
        const { bus, ctx } = await runStageHistory();
        const written = bus.get<TimestampLeakResult>(
            AI_PIPELINE_BUS_KEYS.timestampLeak,
        );

        const result = await makeSanityStep().run(ctx, bus);

        const leak = result.report.readiness.timestampLeak;
        expect(leak).toEqual(leakFactOf(written));
        expect(leak?.n).toBe(FIXTURE_SALES);
        expect(leak?.leaked).toBe(FIXTURE_LEAKED_SALES);
        expect(leak?.sharePct).toBeCloseTo(
            (FIXTURE_LEAKED_SALES / FIXTURE_SALES) * PERCENT,
            1,
        );
        expect(result.report.readiness.dataQuality).toBe(
            AI_SANITY_DATA_QUALITY.flagged,
        );
        expect(result.report.readiness.warningRules).toContain(
            AI_SANITY_RULES.timestampLeak,
        );
        expect(result.warnings.join(' ')).toContain('Протечка меток времени');
    });

    it('отчёт панели из шины попадает в факты модели портала того же прогона', async () => {
        const { bus, ctx } = await runStageHistory();

        const result = await makeSanityStep().run(ctx, bus);
        const facts = portalModelFacts(ctx, bus);

        expect(bus.get<AiSanityReport>(AI_PIPELINE_BUS_KEYS.sanity)).toBe(
            result.report,
        );
        expect(facts.sanity).toBe(result.report);
        expect(
            facts.sanity?.rules.find(
                rule => rule.rule === AI_SANITY_RULES.exposure,
            )?.status,
        ).toBe('warning');
    });
});
