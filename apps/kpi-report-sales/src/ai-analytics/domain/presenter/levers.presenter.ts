/**
 * Рекомендации строки менеджера (план §4.10, поток 16b): топ-3 рычага из
 * дневного снапшота прогноза `ai-analytics-forecast`.
 *
 * Отбор рычагов, их эффект и уровень доказательности считает библиотека
 * (`buildLevers`) на ночном шаге — витрина ничего не пересчитывает и не
 * добавляет своих правил: она переводит готовых кандидатов в DTO и режет
 * список по числу разборов (`n_min_none`: ниже порога наружу не уходит
 * ни одного числа, §5.4).
 *
 * Чистые функции.
 */
import {
    EVIDENCE_DEFAULTS,
    LEVER_DEFAULTS,
    type LeverCandidate,
} from '@lib/sales-ai-analytics';
import {
    AI_ANALYTICS_EVIDENCE_LEVELS,
    AI_ANALYTICS_LEVERS,
    AiAnalyticsEvidenceLevel,
    AiAnalyticsLever,
} from '../../constants/ai-overview.const';
import { AiRecommendationDto } from '../../dto/ai-recommendation.dto';
import type { ForecastView } from '../assembler/overview-model.types';

export type { ForecastView };

/** Опции показа: объём данных менеджера и пороги (по умолчанию — из lib). */
export interface RecommendationsOptions {
    /** Разборов менеджера за период; ниже `minN` список пуст. */
    n?: number;
    /** `lever_max` — сколько рычагов показываем. */
    max?: number;
    /** `n_min_none` — порог, ниже которого чисел наружу нет. */
    minN?: number;
}

const isLever = (value: unknown): value is AiAnalyticsLever =>
    AI_ANALYTICS_LEVERS.some(lever => lever === value);

const isEvidence = (value: unknown): value is AiAnalyticsEvidenceLevel =>
    AI_ANALYTICS_EVIDENCE_LEVELS.some(level => level === value);

const optionalString = (value: unknown): string | undefined =>
    typeof value === 'string' && value !== '' ? value : undefined;

/** Опоры рычага строками; чужая форма — пустой список, а не падение. */
function basisOf(value: unknown): string[] {
    return Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string')
        : [];
}

/** Кандидат библиотеки → рекомендация витрины; чужая форма отбрасывается. */
function toRecommendation(
    candidate: Partial<LeverCandidate>,
): AiRecommendationDto[] {
    if (!isLever(candidate.lever) || typeof candidate.ruleCode !== 'string') {
        return [];
    }
    const deltaSales =
        typeof candidate.deltaSales === 'number' &&
        Number.isFinite(candidate.deltaSales)
            ? candidate.deltaSales
            : undefined;
    const callType = optionalString(candidate.callType);
    const section = optionalString(candidate.section);
    const category = optionalString(candidate.category);

    return [
        {
            lever: candidate.lever,
            ...(callType === undefined ? {} : { callType }),
            ...(section === undefined ? {} : { section }),
            ...(category === undefined ? {} : { category }),
            ...(deltaSales === undefined ? {} : { deltaSales }),
            cost: typeof candidate.cost === 'number' ? candidate.cost : 0,
            evidence: isEvidence(candidate.evidence)
                ? candidate.evidence
                : 'E0',
            basis: basisOf(candidate.basis),
            ruleCode: candidate.ruleCode,
        },
    ];
}

/**
 * Топ-3 рычага из снапшота прогноза. Прогноза нет, рычагов в нём нет либо
 * разборов меньше `n_min_none` — список пуст: рекомендация без данных
 * хуже её отсутствия.
 */
export function toRecommendations(
    forecast: ForecastView | null | undefined,
    options: RecommendationsOptions = {},
): AiRecommendationDto[] {
    const minN = options.minN ?? EVIDENCE_DEFAULTS.minN;
    if (!forecast || (options.n ?? 0) < minN) {
        return [];
    }
    const levers = Array.isArray(forecast.levers) ? forecast.levers : [];

    return levers
        .flatMap(candidate =>
            toRecommendation((candidate ?? {}) as Partial<LeverCandidate>),
        )
        .slice(0, Math.max(0, options.max ?? LEVER_DEFAULTS.max));
}
