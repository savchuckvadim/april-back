import { seedOf, type PipelineEpisode } from '@lib/sales-ai-analytics';
import { AI_ANALYTICS_CALC_VERSION } from '../../constants/ai-overview.const';
import { assembleEpisodes } from '../../domain/assembler/episodes.assembler';
import {
    buildForecastPayload,
    type ForecastPayload,
} from '../../domain/assembler/forecast.assembler';
import { buildManagerMonthPayload } from '../../domain/assembler/manager-month.assembler';
import type {
    AiSnapshotMeta,
    ManagerPassportFacts,
} from '../../domain/assembler/manager-snapshot.types';
import {
    buildPortalModelPayload,
    type PortalModelBuildInput,
} from '../../domain/assembler/portal-model.assembler';
import type {
    PortalManagerMonth,
    PortalModelPayload,
} from '../../domain/assembler/portal-model.types';
import type { AiFinanceMonth } from '../../domain/loaders/finance.types';
import type { DatedLiteRow } from '../../domain/loaders/lite-row.mapper';
import { toPortalManagerMonth } from '../../domain/loaders/portal-model.loader';
import { toStageTransitions } from '../../domain/loaders/stage-history.mapper';
import { managerInput } from '../../steps/forecast.facts';
import {
    openEpisodesOf,
    qualityGroupsOf,
} from '../../steps/portal-model.facts';
import { liteRow, portalSettings } from './lite-row.fixture';
import {
    financeMonth,
    financeResult,
    kpiManagerMonth,
    kpiMonth,
    pipelineRow,
} from './manager-snapshot.fixture';
import {
    FIXTURE_NOW,
    STAGE_HISTORY_ITEMS,
    stageHistoryPortal,
} from './stage-history.fixture';

/**
 * Фикстура пересчёта (приёмка §6 «воспроизводимость по seed»): строки
 * разборов + история стадий + KPI → месяцы менеджеров → модель портала →
 * прогноз дня. Вся цепочка — чистые ассемблеры приложения, без Битрикса и
 * стора: пересчёт по тем же входам обязан дать те же числа.
 */
export const RECOMPUTE_DOMAIN = 'april.bitrix24.ru';
export const RECOMPUTE_MONTHS = ['2026-08', '2026-09'] as const;
export const RECOMPUTE_MONTH = '2026-09';
export const RECOMPUTE_DAY = '2026-09-08';
export const RECOMPUTE_MANAGERS = ['10', '20'] as const;
export const RECOMPUTE_PARAMS_VERSION = 'pv-recompute-1';
export const RECOMPUTE_MODEL_ID = 'ais-model-recompute';

const TIME_ZONE = 'Europe/Moscow';
const GENERATED_AT = '2026-09-08T01:00:00.000Z';

/** Объёмы месяца по менеджерам: звонки, презентации, КП, счета, продажи. */
const VOLUMES: Record<
    (typeof RECOMPUTE_MANAGERS)[number],
    {
        calls: number;
        presentations: number;
        offers: number;
        invoices: number;
        sales: number;
        rows: number;
    }
> = {
    '10': {
        calls: 220,
        presentations: 44,
        offers: 22,
        invoices: 12,
        sales: 5,
        rows: 24,
    },
    '20': {
        calls: 180,
        presentations: 30,
        offers: 14,
        invoices: 8,
        sales: 3,
        rows: 16,
    },
};

export function recomputeMeta(): AiSnapshotMeta {
    return {
        calcVersion: AI_ANALYTICS_CALC_VERSION,
        paramsVersion: RECOMPUTE_PARAMS_VERSION,
        comparableFrom: null,
        generatedAt: GENERATED_AT,
        modelSnapshotId: null,
    };
}

/** Разборы менеджера за месяц: по строке на день, оценки по кругу 50…90. */
function rowsOf(monthKey: string, managerId: string): DatedLiteRow[] {
    const count =
        VOLUMES[managerId as (typeof RECOMPUTE_MANAGERS)[number]].rows;
    return Array.from({ length: count }, (_, index) => {
        const day = String((index % 28) + 1).padStart(2, '0');
        return liteRow({
            transcriptionId: `${managerId}-${monthKey}-${index}`,
            managerId,
            callStartedAt: new Date(`${monthKey}-${day}T09:00:00Z`),
            score: 50 + (index % 5) * 10,
        }) as DatedLiteRow;
    });
}

function passportOf(managerId: string): ManagerPassportFacts {
    return {
        managerId,
        since: '2025-06-01',
        sinceSource: 'employment',
        status: 'active',
        leftAt: null,
        level: null,
        levelSource: null,
        tenureMonths: 15,
        tenureBand: '6-18',
    };
}

/** Финансовый месяц по обоим менеджерам (продажи = исходы KPI). */
function financeOf(monthKey: string): AiFinanceMonth {
    const managers = RECOMPUTE_MANAGERS.map(managerId => ({
        managerId: Number(managerId),
        salesCount: VOLUMES[managerId].sales,
        advanceAmount: 0,
        paidMonths: 0,
        monthlyAmount: VOLUMES[managerId].sales * 30_000,
        expectedContractAmount: 0,
    }));
    return {
        ...financeMonth(monthKey, 10),
        managers,
        totals: {
            salesCount: managers.reduce((sum, row) => sum + row.salesCount, 0),
            advanceAmount: 0,
            paidMonths: 0,
            monthlyAmount: managers.reduce(
                (sum, row) => sum + row.monthlyAmount,
                0,
            ),
            expectedContractAmount: 0,
        },
    };
}

/** Месяцы менеджеров в объёме модели портала — через ассемблер месяца. */
function portalMonthsOf(chainSharePct: number): PortalManagerMonth[] {
    const settings = portalSettings();
    return RECOMPUTE_MONTHS.flatMap(monthKey => {
        const assembly = buildManagerMonthPayload({
            monthKey,
            day:
                monthKey === RECOMPUTE_MONTH ? RECOMPUTE_DAY : `${monthKey}-31`,
            today: RECOMPUTE_DAY,
            managerIds: [...RECOMPUTE_MANAGERS],
            calendar: settings.calendar,
            timeZone: TIME_ZONE,
            rows: RECOMPUTE_MANAGERS.flatMap(managerId =>
                rowsOf(monthKey, managerId),
            ),
            kpi: kpiMonth(
                monthKey,
                RECOMPUTE_MANAGERS.map(managerId =>
                    kpiManagerMonth(Number(managerId), {
                        callDone: VOLUMES[managerId].calls,
                        presentationUniqDone: VOLUMES[managerId].presentations,
                        offers: VOLUMES[managerId].offers,
                        invoices: VOLUMES[managerId].invoices,
                        success: VOLUMES[managerId].sales,
                    }),
                ),
            ),
            finance: financeResult(
                [financeOf(monthKey)],
                RECOMPUTE_MANAGERS.map(managerId =>
                    pipelineRow(Number(managerId), { count: 4, hot: 2 }),
                ),
            ),
            settings,
            registry: {},
            passports: new Map(
                RECOMPUTE_MANAGERS.map(id => [id, passportOf(id)] as const),
            ),
            plans: new Map(
                RECOMPUTE_MANAGERS.map(
                    id =>
                        [
                            id,
                            {
                                sales: VOLUMES[id].sales + 1,
                                calls: VOLUMES[id].calls,
                                presentations: VOLUMES[id].presentations,
                            },
                        ] as const,
                ),
            ),
            styles: new Map(),
            chainSharePct,
            comparableFrom: null,
            meta: recomputeMeta(),
        });
        return assembly.rows.map(row =>
            toPortalManagerMonth(monthKey, row.managerId, row.payload),
        );
    });
}

/** Модель портала по фикстуре: история стадий → θ, лаги, цикл, глубина. */
export function recomputeModelInput(): PortalModelBuildInput {
    const episodes = assembleEpisodes({
        transitions: toStageTransitions(
            STAGE_HISTORY_ITEMS,
            stageHistoryPortal(),
        ),
        now: FIXTURE_NOW,
    });
    const rows = RECOMPUTE_MONTHS.flatMap(monthKey =>
        RECOMPUTE_MANAGERS.flatMap(managerId => rowsOf(monthKey, managerId)),
    );
    return {
        monthKey: RECOMPUTE_MONTH,
        window: [...RECOMPUTE_MONTHS],
        months: portalMonthsOf(episodes.chainSharePct),
        registry: {},
        qualityGroups: qualityGroupsOf(rows),
        stageThetas: episodes.stageThetas,
        saleLags: episodes.saleLags,
        cycleMedianDays: episodes.cycleMedianDays,
        chainSharePct: episodes.chainSharePct,
        edgeKind: episodes.chain.estimand.estimand,
        edgeKindReason: episodes.chain.estimand.reason,
        historyMonths: episodes.historyMonths,
        hypothesisPairs: 0,
        readiness: {
            enabled: true,
            pipelineEnabled: true,
            calendarImported: true,
            rosterLevels: RECOMPUTE_MANAGERS.length,
            rosterConfirmedAt: '2026-08-01',
            comparableFrom: '',
        },
        sanity: null,
        events: [],
        detectedEvents: [],
        signature: { rubricVersion: null, scriptHash: null, priceMedian: null },
        meta: recomputeMeta(),
    };
}

export const recomputeModel = (): PortalModelPayload =>
    buildPortalModelPayload(recomputeModelInput());

/** Открытые эпизоды фикстуры истории стадий → пайплайн менеджера. */
function openEpisodesFor(model: PortalModelPayload): PipelineEpisode[] {
    const theta = new Map(
        model.stageTheta.map(stage => [stage.stageCode, stage.value]),
    );
    const episodes = assembleEpisodes({
        transitions: toStageTransitions(
            STAGE_HISTORY_ITEMS,
            stageHistoryPortal(),
        ),
        now: FIXTURE_NOW,
    });
    return openEpisodesOf(episodes.openEpisodes).map(episode => ({
        id: episode.key,
        ageDays: episode.ageDays,
        theta: theta.get(episode.stageCode) ?? 0,
    }));
}

/** Seed прогноза — тот же ключ, что у ночного шага. */
export const recomputeSeed = (managerId: string): number =>
    seedOf(
        RECOMPUTE_DOMAIN,
        managerId,
        RECOMPUTE_DAY,
        AI_ANALYTICS_CALC_VERSION,
    );

/** Прогноз дня менеджера по модели фикстуры с заданным seed. */
export function recomputeForecast(
    model: PortalModelPayload,
    months: readonly PortalManagerMonth[],
    managerId: string,
    seed: number,
): ForecastPayload {
    return buildForecastPayload({
        day: RECOMPUTE_DAY,
        monthKey: RECOMPUTE_MONTH,
        workdaysInMonth: 22,
        daysElapsed: 5,
        daysLeft: 17,
        model,
        modelSnapshotId: RECOMPUTE_MODEL_ID,
        hasStageHistory: true,
        registry: {},
        manager: managerInput({
            managerId,
            months,
            monthKey: RECOMPUTE_MONTH,
            previousMonth: RECOMPUTE_MONTHS[0],
            openEpisodes: managerId === '10' ? openEpisodesFor(model) : [],
            model,
            targets: portalSettings().targets,
        }),
        seed,
        meta: { ...recomputeMeta(), modelSnapshotId: RECOMPUTE_MODEL_ID },
    });
}
