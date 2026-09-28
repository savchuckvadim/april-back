import {
    trimEvidencePack,
    type AiBriefFact,
    type AiEvidencePack,
    type AttentionSignal,
    type BriefCompareStatus,
} from '@lib/sales-ai-analytics';
import { AI_BRIEF_FACT_CODES } from '../../constants/ai-brief.const';
import { buildBriefKey } from '../../brief/brief-cache-key.util';
import { briefFact } from '../../brief/evidence-pack.types';
import type { AiAttentionItemDto } from '../../dto/ai-attention.dto';
import type { AiBriefJobData } from '../../dto/ai-brief.dto';
import type { AiManagerRowDto } from '../../dto/ai-manager-row.dto';
import type { AiOverviewDto } from '../../dto/ai-overview.dto';

/** Домен, период и «сейчас» тестов резюме (вторник 08.09.2026, 09:00 МСК). */
export const BRIEF_DOMAIN = 'april.bitrix24.ru';
export const BRIEF_FROM = '2026-09-01';
export const BRIEF_TO = '2026-09-07';
export const BRIEF_NOW = new Date('2026-09-08T06:00:00Z');
/** Предыдущий рабочий день портала для BRIEF_NOW — ключ кэша пульса. */
export const BRIEF_PULSE_DAY = '2026-09-07';
/** Прошлый период той же длины: неделя до BRIEF_FROM. */
export const BRIEF_PREV_FROM = '2026-08-25';
export const BRIEF_PREV_TO = '2026-08-31';
/** Месяц конца периода и предыдущий — ключи месячных снапшотов. */
export const BRIEF_MONTH = '2026-09';
export const BRIEF_PREV_MONTH = '2026-08';

/** Три факта разных видов: алерт, отклонение, дисциплина. */
export function briefFacts(): AiBriefFact[] {
    return [
        briefFact(AI_BRIEF_FACT_CODES.alerts, 3, { n: 3 }),
        briefFact(AI_BRIEF_FACT_CODES.attention, 5, { n: 7 }),
        briefFact(AI_BRIEF_FACT_CODES.disciplineNextStep, 0.42, { n: 120 }),
    ];
}

/** У пакета есть сравнение с прошлым периодом той же длины. */
export const BRIEF_COMPARED: BriefCompareStatus = {
    previousPeriod: { from: BRIEF_PREV_FROM, to: BRIEF_PREV_TO },
    reason: null,
};

/**
 * Готовый пакет фактов (реальные хэш и обрезка библиотеки); без статуса
 * сравнения пакет считается несравнённым («данных нет»).
 */
export function briefPack(
    facts: AiBriefFact[] = briefFacts(),
    compare?: BriefCompareStatus,
): AiEvidencePack {
    return trimEvidencePack(facts, compare ? { compare } : {});
}

/** Payload джобы резюме; переопределяй нужные поля. */
export function briefJobData(
    overrides: Partial<AiBriefJobData> = {},
): AiBriefJobData {
    const packHash = overrides.packHash ?? briefPack().hash;

    return {
        domain: BRIEF_DOMAIN,
        from: BRIEF_FROM,
        to: BRIEF_TO,
        managerIds: [10, 20],
        requestKey: buildBriefKey(BRIEF_DOMAIN, packHash),
        packHash,
        socketId: 'sock',
        requesterUserId: '447',
        ...overrides,
    };
}

/** Недельный снапшот менеджера в объёме, который читает сборщик пакета. */
export function weekRow(
    managerId: string,
    options: { flags?: string[]; nextStepPct?: number; n?: number } = {},
) {
    return {
        managerId,
        periodKey: '2026-W37',
        payload: {
            flags: options.flags ?? ['promise'],
            byType: [
                {
                    callType: 'presentation',
                    checklists: {
                        nextStepDateRatePct: {
                            value: options.nextStepPct ?? 50,
                            n: options.n ?? 20,
                        },
                    },
                },
            ],
        },
    };
}

/** Месячный снапшот менеджера: финансы, план, типы звонков и рёбра. */
export function monthRow(
    managerId: string,
    options: {
        monthKey?: string;
        salesCount?: number;
        planSales?: number | null;
        calls?: number;
        edges?: { edge: string; n: number; s: number }[];
    } = {},
) {
    return {
        managerId,
        periodKey: options.monthKey ?? BRIEF_MONTH,
        payload: {
            finance: { salesCount: options.salesCount ?? 4 },
            planSnapshot:
                options.planSales === undefined
                    ? { sales: 6 }
                    : options.planSales === null
                      ? null
                      : { sales: options.planSales },
            byType: [{ callType: 'presentation', n: options.calls ?? 30 }],
            edges: options.edges ?? [
                { edge: 'call_to_presentation', n: 100, s: 12 },
            ],
        },
    };
}

/** Дневной прогноз менеджера: P50, λ_pipe и утечки рёбер. */
export function forecastRow(
    managerId: string,
    options: {
        p50?: number;
        pipelineExpected?: number | null;
        leaks?: number;
    } = {},
) {
    return {
        managerId,
        periodKey: BRIEF_TO,
        payload: {
            p50: options.p50 ?? 5,
            pipelineExpected: options.pipelineExpected ?? 2,
            leaks: Array.from({ length: options.leaks ?? 2 }, (_, index) => ({
                edge: `edge-${index}`,
            })),
        },
    };
}

/** Снапшот модели портала: нормы рёбер, готовность и санити-панель. */
export function modelRecord(options: {
    mode?: string;
    reasons?: string[];
    warnings?: string[];
    warningRules?: string[];
    mu?: number;
    comparableFrom?: string;
}) {
    return {
        managerId: null,
        payload: {
            edges: [{ edge: 'call_to_presentation', mu: options.mu ?? 0.2 }],
            readiness: {
                mode: options.mode ?? 'descriptive',
                reasons: options.reasons ?? ['roster-not-confirmed'],
                comparableFrom: options.comparableFrom ?? '',
            },
            sanity:
                options.warnings === undefined
                    ? null
                    : {
                          warnings: options.warnings,
                          rules: (options.warningRules ?? []).map(rule => ({
                              rule,
                              status: 'warning',
                              warnings: [],
                          })),
                      },
        },
    };
}

/** Параметры строки обзора для пакета резюме. */
export interface BriefOverviewRowOptions {
    riskCalls?: number;
    salesCount?: number;
    analyzed?: number;
    /** Доли «шаг с датой» за два окна и объём каждого. */
    nextStep?: {
        current: number | null;
        previous: number | null;
        n?: number;
        nPrev?: number;
    };
    /**
     * Доля «шаг с датой» за весь период (0..1) и число разобранных
     * звонков ячейки «менеджер × тип»; null — звонков мало, доли нет.
     */
    stepShare?: { share: number | null; n: number };
    signal?: AttentionSignal | null;
    /** Разрыв к норме на шаге «звонок → презентация» и норма уровня. */
    gap?: number;
    levelNorm?: number;
    /** Направление разрыва из обзора; none — в пределах шума. */
    gapDirection?: 'above' | 'below' | 'none';
    /** Трактовка шага: prob — доля перехода, rate — интенсивность. */
    estimand?: 'prob' | 'rate';
}

/** Старшая карточка «Внимания» строки (для factов attention/фокуса). */
function signalOf(
    managerId: string,
    signal: AttentionSignal,
): AiAttentionItemDto {
    return {
        managerId,
        rank: 1,
        signal,
        availableFrom: 1,
        headline: 'Сигналы риска: 2',
        basis: [{ code: 'risk_calls', value: 2, n: 10 }],
        link: { managerId },
    };
}

/**
 * Строка обзора в объёме, который читают сборщик пакета и правила
 * «Внимания» (`buildAttentionItems`): риск-звонки, продажи, разобранные
 * звонки, доля «шаг с датой» за два окна, дисциплина и воронка.
 */
export function briefOverviewRow(
    managerId: string,
    options: BriefOverviewRowOptions = {},
): AiManagerRowDto {
    const analyzed = options.analyzed ?? 20;
    const nextStep = options.nextStep ?? { current: null, previous: null };
    const metric = (value: number | null, n: number) => ({
        value,
        n,
        confidence: { level: 'low' },
    });
    const row = {
        managerId,
        departmentId: null,
        groupId: null,
        workdays: 5,
        signal:
            options.signal === undefined || options.signal === null
                ? null
                : signalOf(managerId, options.signal),
        byType:
            options.stepShare === undefined
                ? []
                : [
                      {
                          callType: 'presentation',
                          n: options.stepShare.n,
                          kpi: [],
                          checklists: {
                              nextStepDateRatePct: metric(
                                  options.stepShare.share === null
                                      ? null
                                      : options.stepShare.share * 100,
                                  options.stepShare.n,
                              ),
                          },
                      },
                  ],
        funnel:
            options.gap === undefined
                ? []
                : [
                      {
                          edge: 'call_to_presentation',
                          title: 'Звонок → презентация',
                          ...(options.gapDirection === undefined
                              ? {}
                              : { gapDirection: options.gapDirection }),
                          ...(options.estimand === undefined
                              ? {}
                              : { estimand: options.estimand }),
                          n: 100,
                          s: 12,
                          rate: metric(0.12, 100),
                          gap: options.gap,
                          levelNorm: options.levelNorm ?? 0.2,
                          priorSource: 'portal',
                      },
                  ],
        finance: { salesCount: options.salesCount ?? 0 },
        discipline: {
            callPlan: 0,
            callDone: 0,
            presentationPlan: 0,
            presentationDone: 0,
        },
        callsTotal: analyzed,
        analyzedCalls: analyzed,
        nextStepRate: {
            windowDays: 14,
            current: metric(nextStep.current, nextStep.n ?? 40),
            previous: metric(nextStep.previous, nextStep.nPrev ?? 40),
        },
        riskCalls: Array.from(
            { length: options.riskCalls ?? 0 },
            (_, index) => ({
                transcriptionId: `${managerId}-r${index}`,
                kind: 'promise',
                callStartedAt: '2026-09-02T08:00:00.000Z',
            }),
        ),
        recommendations: [],
    };

    return row as unknown as AiManagerRowDto;
}

/** Обзор для пакета резюме: строки, готовность и служебная сводка. */
export function briefOverview(
    rows: AiManagerRowDto[],
    options: { comparableFrom?: string; reasons?: string[] } = {},
): AiOverviewDto {
    const overview = {
        managers: rows,
        readiness: {
            comparableFrom: options.comparableFrom ?? '',
            reasons: options.reasons ?? [],
        },
        meta: {
            analyzedCalls: rows.reduce(
                (acc, row) => acc + row.analyzedCalls,
                0,
            ),
        },
    };

    return overview as unknown as AiOverviewDto;
}
