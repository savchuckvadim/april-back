/**
 * Обвязка спеки шага «связь качества с результатом» (Фаза 4, П15/П20):
 * шаг на моках загрузчиков и стора, месячный контекст, шина после шага
 * истории стадий. Вынесена из спеки по лимиту 300 строк.
 */
import {
    AI_ANALYTICS_SNAPSHOT_TYPE,
    type QualityLinkSnapshot,
    type SnapshotEnvelope,
} from '@lib/sales-ai-analytics';
import type { AnalyticsCallLiteRow } from '@lib/call-lib';
import { AI_PIPELINE_BUS_KEYS } from '../../constants/ai-snapshot.const';
import type { CallEntityRef } from '../../domain/loaders/call-entity.loader';
import { CallsLoader } from '../../domain/loaders/calls.loader';
import { QualityLinkStep } from '../../steps/quality-link.step';
import {
    createStepBus,
    type AiPipelineStepContext,
    type StepBus,
} from '../../steps/step.types';
import { stepContext } from './manager-snapshot.fixture';
import {
    QL_DAY,
    QL_MONTH,
    QL_NOW,
    QL_PREVIOUS_MONTH,
    portalModelPayload,
    syntheticPortal,
} from './quality-link.fixture';

/** Портал по умолчанию: 8 менеджеров × 60 сделок за год. */
export const PORTAL = syntheticPortal();

export type Upsert = jest.Mock<
    Promise<{ id: string; supersededIds: string[]; written: 0 | 1 }>,
    [SnapshotEnvelope<QualityLinkSnapshot>, { force?: boolean }]
>;

export interface Harness {
    readonly step: QualityLinkStep;
    readonly loadLite: jest.Mock;
    readonly loadRefs: jest.Mock;
    readonly findByKeys: jest.Mock;
    readonly latestModel: jest.Mock;
    readonly upsert: Upsert;
}

/** Шаг на моках: звонки, сущности и стор снапшотов (`as never`). */
export function harness(
    options: {
        rows?: AnalyticsCallLiteRow[];
        refs?: Map<string, CallEntityRef>;
        previousStreak?: number | null;
        golden?: unknown;
        model?: { id: string; payload: unknown } | null;
    } = {},
): Harness {
    const loadLite = jest.fn().mockResolvedValue({
        rows: options.rows ?? PORTAL.rows,
        totalCalls: 0,
        skippedNoManager: 0,
    });
    const loadRefs = jest.fn().mockResolvedValue(options.refs ?? PORTAL.refs);
    const previous =
        options.previousStreak === undefined || options.previousStreak === null
            ? []
            : [
                  {
                      periodKey: QL_PREVIOUS_MONTH,
                      managerId: null,
                      payload: { gate: { streak: options.previousStreak } },
                  },
              ];
    const findByKeys = jest.fn().mockResolvedValue(previous);
    const latest = jest
        .fn()
        .mockImplementation((_: string, type: string) =>
            Promise.resolve(
                type === AI_ANALYTICS_SNAPSHOT_TYPE.goldenReport &&
                    options.golden !== undefined
                    ? { payload: options.golden }
                    : null,
            ),
        );
    const model =
        options.model === undefined
            ? { id: 'model-8', payload: portalModelPayload(0.5) }
            : options.model;
    const latestModel = jest.fn().mockResolvedValue(model);
    const upsert = jest.fn().mockResolvedValue({
        id: 'ql-1',
        supersededIds: [],
        written: 1,
    }) as Upsert;
    const step = new QualityLinkStep(
        new CallsLoader({ loadLite } as never),
        { load: loadRefs } as never,
        { findByKeys, latest, latestModel, upsert } as never,
    );

    return { step, loadLite, loadRefs, findByKeys, latestModel, upsert };
}

/** Месячный прогон 3 октября по закрытому сентябрю. */
export const monthly = (
    patch: Partial<AiPipelineStepContext> = {},
): AiPipelineStepContext =>
    stepContext({
        rhythm: 'monthly',
        day: QL_DAY,
        weekKey: '2026-W40',
        monthKey: QL_MONTH,
        managerIds: PORTAL.managerIds,
        now: QL_NOW,
        ...patch,
    });

/**
 * Шина после шага истории стадий: глубина истории (её шаг пишет всегда,
 * и при своём пропуске), эпизоды и протечка меток времени.
 */
export function busWith(
    episodes: unknown = PORTAL.episodes,
    leak: unknown = { n: 100, leaked: 1, sharePct: 1, maxPct: 0.05 },
): StepBus {
    const bus = createStepBus();
    bus.set(AI_PIPELINE_BUS_KEYS.historyMonths, 12);
    bus.set(AI_PIPELINE_BUS_KEYS.episodes, episodes);
    bus.set(AI_PIPELINE_BUS_KEYS.timestampLeak, leak);

    return bus;
}

/** Порог SE гейта поднят, чтобы синтетика из 480 сделок его проходила. */
export const EASY_GATE = { portal: { beta_gate_se: 0.15 } };

/** Последняя записанная нагрузка. */
export const written = (
    upsert: Upsert,
): SnapshotEnvelope<QualityLinkSnapshot> =>
    upsert.mock.calls[upsert.mock.calls.length - 1][0];
