import {
    trimEvidencePack,
    type AiBriefFact,
    type AiEvidencePack,
} from '@lib/sales-ai-analytics';
import { AI_BRIEF_FACT_CODES } from '../../constants/ai-brief.const';
import { briefFact } from '../../brief/evidence-pack.types';
import type { AiBriefJobData } from '../../dto/ai-brief.dto';

/** Домен, период и «сейчас» тестов резюме (вторник 08.09.2026, 09:00 МСК). */
export const BRIEF_DOMAIN = 'april.bitrix24.ru';
export const BRIEF_FROM = '2026-09-01';
export const BRIEF_TO = '2026-09-07';
export const BRIEF_NOW = new Date('2026-09-08T06:00:00Z');
/** Предыдущий рабочий день портала для BRIEF_NOW — ключ кэша пульса. */
export const BRIEF_PULSE_DAY = '2026-09-07';

/** Три факта разных видов: алерт, отклонение, дисциплина. */
export function briefFacts(): AiBriefFact[] {
    return [
        briefFact(AI_BRIEF_FACT_CODES.alerts, 3, { n: 3 }),
        briefFact(AI_BRIEF_FACT_CODES.attention, 5, { n: 7 }),
        briefFact(AI_BRIEF_FACT_CODES.disciplineNextStep, 0.42, { n: 120 }),
    ];
}

/** Готовый пакет фактов (реальные хэш и обрезка библиотеки). */
export function briefPack(facts: AiBriefFact[] = briefFacts()): AiEvidencePack {
    return trimEvidencePack(facts);
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
        requestKey: `sales-ai-analytics:v1:${BRIEF_DOMAIN}:brief:${packHash}`,
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
        salesCount?: number;
        planSales?: number | null;
        calls?: number;
        edges?: { edge: string; n: number; s: number }[];
    } = {},
) {
    return {
        managerId,
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
    mu?: number;
}) {
    return {
        managerId: null,
        payload: {
            edges: [{ edge: 'call_to_presentation', mu: options.mu ?? 0.2 }],
            readiness: {
                mode: options.mode ?? 'descriptive',
                reasons: options.reasons ?? ['roster-not-confirmed'],
            },
            sanity:
                options.warnings === undefined
                    ? null
                    : { warnings: options.warnings },
        },
    };
}
