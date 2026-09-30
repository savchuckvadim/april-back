/**
 * Фикстуры шага «связь качества с результатом» (Фаза 4, П15/П20):
 * синтетический портал с известной связью «качество презентации → КП за
 * 3 дня» (эпизоды истории стадий, lite-строки звонков, сущности из `ais`),
 * отчёт согласия оценщика и модель портала.
 *
 * Случайность — только seedOf/mulberry32: фикстура воспроизводима. Коды
 * стадий — из PBX_DEAL_SALES_BASE_STAGE_CODE, литералов стадий нет.
 */
import type { AnalyticsCallLiteRow } from '@lib/call-lib';
import {
    PBX_DEAL_SALES_BASE_STAGE_CODE,
    getSalesBaseStageOrder,
    type PbxDealSalesBaseStageCode,
} from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import {
    buildEpisodes,
    mulberry32,
    sampleNormal,
    seedOf,
    type DealEpisode,
    type GoldenReport,
    type StageTransition,
} from '@lib/sales-ai-analytics';
import type { CallEntityRef } from '../../domain/loaders/call-entity.loader';
import { liteRow } from './lite-row.fixture';

const STAGE = PBX_DEAL_SALES_BASE_STAGE_CODE;
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** Момент месячного прогона 3 октября 2026 (заморозка сентября). */
export const QL_NOW = new Date('2026-10-03T01:00:00Z');
export const QL_DAY = '2026-10-03';
export const QL_MONTH = '2026-09';
export const QL_PREVIOUS_MONTH = '2026-08';

/** Первая презентация окна — 1 октября 2025 (окно 12 месяцев до сентября). */
const START_MS = Date.parse('2025-10-01T06:00:00Z');

export interface SyntheticPortalOptions {
    readonly managers?: number;
    readonly perManager?: number;
    /** Наклон на логите за балл качества. */
    readonly beta?: number;
    readonly seed?: number;
}

export interface SyntheticPortal {
    readonly managerIds: number[];
    readonly rows: AnalyticsCallLiteRow[];
    readonly episodes: DealEpisode[];
    readonly refs: Map<string, CallEntityRef>;
}

const expit = (x: number): number => 1 / (1 + Math.exp(-x));
const clamp = (value: number): number => Math.min(10, Math.max(1, value));

const transition = (
    entityId: string,
    code: PbxDealSalesBaseStageCode,
    ms: number,
): StageTransition => ({
    entityId,
    stageCode: code,
    order: getSalesBaseStageOrder(code),
    semantic: code === STAGE.fail ? 'F' : 'P',
    at: new Date(ms).toISOString(),
});

/**
 * Портал: у каждого менеджера `perManager` сделок; презентация — звонок
 * через час после входа в стадию, оценка формы S (разделы GREETING и
 * NEEDS), через 3 дня — КП с вероятностью `expit(β·(S − 6,5))` либо отказ.
 */
export function syntheticPortal(
    options: SyntheticPortalOptions = {},
): SyntheticPortal {
    const managers = options.managers ?? 8;
    const perManager = options.perManager ?? 60;
    const beta = options.beta ?? 0.6;
    const random = mulberry32(seedOf('quality-link', options.seed ?? 1));
    const total = managers * perManager;
    const spacing = Math.floor((355 * DAY_MS) / total);
    const transitions: StageTransition[] = [];
    const rows: AnalyticsCallLiteRow[] = [];
    const refs = new Map<string, CallEntityRef>();
    const managerIds = Array.from({ length: managers }, (_, m) => 10 * (m + 1));
    for (let index = 0; index < total; index += 1) {
        const managerId = managerIds[index % managers];
        const mean = 5.5 + (index % managers) * 0.25;
        const score = clamp(mean + 1.3 * sampleNormal(random));
        const dealId = `d${index + 1}`;
        const callId = `t${index + 1}`;
        const start = START_MS + index * spacing;
        const advanced = random() < expit(beta * (score - 6.5));
        transitions.push(
            transition(dealId, STAGE.presentation, start),
            transition(
                dealId,
                advanced ? STAGE.offerCreate : STAGE.fail,
                start + 3 * DAY_MS,
            ),
        );
        rows.push(
            liteRow({
                transcriptionId: callId,
                managerId: String(managerId),
                callStartedAt: new Date(start + HOUR_MS),
                callType: 'presentation',
                score: Math.round(score * 10),
                sections: [
                    {
                        section: 'GREETING',
                        relevance: 80,
                        score,
                        asWas: null,
                        alternatives: [],
                    },
                    {
                        section: 'NEEDS',
                        relevance: 80,
                        score,
                        asWas: null,
                        alternatives: [],
                    },
                ],
            }),
        );
        refs.set(callId, {
            transcriptionId: callId,
            entityType: 'deal',
            entityId: dealId,
        });
    }

    return {
        managerIds,
        rows,
        episodes: buildEpisodes(transitions, { now: QL_NOW.toISOString() }),
        refs,
    };
}

/** Отчёт согласия с ICC по шкалам разделов и общему баллу. */
export function goldenReport(
    scales: readonly { code: string; icc21: number | null }[],
): GoldenReport {
    return {
        promptVersion: 'v1',
        pairs: 40,
        budget: { quota: 50, withinQuota: true },
        categories: [],
        scales: scales.map(scale => ({
            code: scale.code,
            n: 40,
            icc:
                scale.icc21 === null
                    ? null
                    : {
                          n: 40,
                          k: 2,
                          msRows: 1,
                          msCols: 0,
                          msError: 0.1,
                          icc21: scale.icc21,
                          icc31: scale.icc21,
                      },
            tost: null,
            sigma: null,
        })),
        objections: {
            pairsWithObjections: 0,
            micro: { precision: 1, recall: 1, f1: 1, tp: 0, fp: 0, fn: 0 },
            byCode: [],
        },
        sigmaLlm: {
            scale: 'score',
            measured: null,
            n: 0,
            minPairs: 30,
            configured: 0.5,
            source: 'configured',
            value: 0.5,
        },
    };
}

/** Нагрузка модели портала: норма «презентация → КП» и опорное качество. */
export const portalModelPayload = (mu: number, sRef = 7) => ({
    monthKey: QL_PREVIOUS_MONTH,
    sRef,
    edges: [
        { edge: 'call_to_presentation', mu: 0.05, n: 1000, kappa: 20 },
        { edge: 'presentation_to_offer', mu, n: 400, kappa: 20 },
    ],
});
