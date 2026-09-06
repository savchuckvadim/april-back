import type {
    AnalyticsLiteObjection,
    AnalyticsLiteSection,
} from '@lib/call-lib/call-report-analytics/types/analytics-lite.types';
import { MatrixCallRow } from '../model/matrix.types';

/** Версии разбора по умолчанию (все строки сравнимы между собой). */
export const FIXTURE_VERSIONS: Record<string, string> = {
    prompt: 'focus-v2.1-2026-09-05',
    rubric: 'sections-7-v1',
    registry: 'abc',
    attribution: '2026-08-24',
    classifier: '2026-09-05',
};

export type LiteRowPatch = Partial<MatrixCallRow> & { transcriptionId: string };

/** Разобранный звонок-презентация менеджера m1 8 сентября 2026, 10 минут. */
export const liteRow = (patch: LiteRowPatch): MatrixCallRow => ({
    managerId: 'm1',
    callStartedAt: new Date('2026-09-08T09:00:00+03:00'),
    durationSec: 600,
    callType: 'presentation',
    analysisPresent: true,
    score: 70,
    nextStep: { set: true, date: '2026-09-15' },
    riskFlags: [],
    coachingPriority: null,
    sections: [],
    objections: [],
    versions: { ...FIXTURE_VERSIONS },
    ...patch,
});

/** count строк с id `${prefix}${i}` (i с 1) и общим патчем. */
export const liteRows = (
    prefix: string,
    count: number,
    patch: Partial<MatrixCallRow> = {},
): MatrixCallRow[] =>
    Array.from({ length: count }, (_, index) =>
        liteRow({ transcriptionId: `${prefix}${index + 1}`, ...patch }),
    );

export const section = (
    code: string,
    score: number | null,
    relevance = 80,
): AnalyticsLiteSection => ({
    section: code,
    relevance,
    score,
    asWas: null,
    alternatives: [],
});

export const objection = (
    patch: Partial<AnalyticsLiteObjection> = {},
): AnalyticsLiteObjection => ({
    category: 'price',
    quote: 'Дорого',
    handled: true,
    outcome: 'continued',
    ...patch,
});

/** Детерминированный ГПСЧ (mulberry32) для перестановок в тестах. */
export function mulberry32(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Перестановка Фишера–Йетса с seed. */
export function shuffle<T>(items: readonly T[], seed: number): T[] {
    const random = mulberry32(seed);
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}
