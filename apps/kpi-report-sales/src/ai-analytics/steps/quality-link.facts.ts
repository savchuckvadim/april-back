/**
 * Разбор чужих значений для шага «связь качества с результатом» (Фаза 4,
 * П15/П20): эпизоды и протечка меток времени из шины шага истории стадий,
 * серия гейта из прошлого снапшота `quality-link`, надёжность формы из
 * отчёта согласия оценщика, оффсет и опорное качество из модели портала.
 *
 * Отделено от `quality-link.step.ts` по образцу `stage-history.facts.ts`:
 * шаг оркеструет, разбор — здесь. Чужая или неполная форма деградирует до
 * «нет данных», а не роняет прогон (§5.4).
 */
import {
    isGoldenReportLike,
    logit,
    type DealEpisode,
} from '@lib/sales-ai-analytics';
import {
    AI_QUALITY_LINK_OFFSET_EDGE,
    AI_QUALITY_LINK_SECTION_SCALE_PREFIX,
} from '../constants/ai-quality-link.const';
import { previousMonthKey } from '../constants/ai-snapshot.const';
import { portalRangeUtc } from '../domain/loaders/period.util';

type Unknown = Record<string, unknown>;

const PCT_IN_UNIT = 100;

/** Шкала качества звонка 1–10 — границы опорного S_ref. */
const SCORE_MIN = 1;
const SCORE_MAX = 10;

const asRecord = (value: unknown): Unknown | null =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
        ? (value as Unknown)
        : null;

const asFinite = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;

/** Эпизоды сделок из шины (`episodes`); чужая форма — пустой список. */
export function qualityLinkEpisodesOf(value: unknown): DealEpisode[] {
    if (!Array.isArray(value)) return [];

    return value.flatMap((item: unknown): DealEpisode[] => {
        const row = asRecord(item);

        return row &&
            typeof row.entityId === 'string' &&
            typeof row.key === 'string' &&
            typeof row.stageCode === 'string' &&
            typeof row.startedAt === 'string'
            ? [row as unknown as DealEpisode]
            : [];
    });
}

/**
 * Протечка меток времени в норме: доля из шины (`timestampLeak`, проценты)
 * против `dq_timestamp_leak_max` (доля). Значения нет или продаж в проверке
 * нет — протечки не обнаружено, гейт этим условием не блокируется.
 */
export function timestampLeakOkOf(value: unknown, maxShare: number): boolean {
    const leak = asRecord(value);
    const n = asFinite(leak?.n);
    const sharePct = asFinite(leak?.sharePct);
    if (n === null || n === 0 || sharePct === null) return true;

    return sharePct / PCT_IN_UNIT <= maxShare;
}

/**
 * Серия пройденных пересчётов гейта из снапшота `quality-link` ПРОШЛОГО
 * месяца (`gate.streak`). Снапшота нет или форма чужая — 0: гистерезис
 * стартует заново, повтор прогона того же месяца серию не удваивает.
 */
export function previousStreakOf(payload: unknown): number {
    const streak = asFinite(asRecord(asRecord(payload)?.gate)?.streak);

    return streak === null ? 0 : Math.max(0, Math.floor(streak));
}

/**
 * Надёжность формы `r` из отчёта согласия оценщика: среднее ICC(2,1) по
 * шкалам `section_<CODE>` разделов формы. Отчёта нет, форма чужая или ни
 * одна шкала формы не измерена — null (поправка на надёжность скрыта).
 * ⚠ ICC ≤ 0 (оценщик не согласен сам с собой) входит в среднее нулём, а не
 * отбрасывается: иначе `r` завышена и β недокорректирована. Среднее 0 —
 * библиотека скроет поправку с причиной «надёжность слишком низкая».
 */
export function iccFormOf(
    payload: unknown,
    formSections: readonly string[],
): number | null {
    if (!isGoldenReportLike(payload)) return null;
    const codes = new Set(
        formSections.map(
            section => `${AI_QUALITY_LINK_SECTION_SCALE_PREFIX}${section}`,
        ),
    );
    const values = payload.scales.flatMap(scale => {
        const icc = scale.icc?.icc21;

        return codes.has(scale.code) &&
            typeof icc === 'number' &&
            Number.isFinite(icc)
            ? [Math.min(1, Math.max(0, icc))]
            : [];
    });

    return values.length === 0
        ? null
        : values.reduce((acc, value) => acc + value, 0) / values.length;
}

/**
 * Оффсет портал×месяц: логит нормы «презентация → КП» модели портала.
 * Ребра нет или μ вне (0; 1) (трактовка интенсивности) — null.
 */
export function offsetLogitOf(modelPayload: unknown): number | null {
    const edges = asRecord(modelPayload)?.edges;
    if (!Array.isArray(edges)) return null;
    const edge = edges
        .map(asRecord)
        .find(item => item?.edge === AI_QUALITY_LINK_OFFSET_EDGE);
    const mu = asFinite(edge?.mu);

    return mu !== null && mu > 0 && mu < 1 ? logit(mu) : null;
}

/** Опорное качество S_ref модели портала; нет или вне шкалы — null. */
export function modelSRefOf(modelPayload: unknown): number | null {
    const sRef = asFinite(asRecord(modelPayload)?.sRef);

    return sRef !== null && sRef >= SCORE_MIN && sRef <= SCORE_MAX
        ? sRef
        : null;
}

/**
 * Горизонт данных прогона для цензуры ближнего исхода: момент запуска, но
 * не позже конца дня прогона в поясе портала. В догоне истории день прогона
 * — последний день месяца, и эпизоды шаг истории стадий собрал только до
 * него: по моменту запуска окно звонка конца месяца «истекло бы» без
 * известного исхода, и такая строка ложно ушла бы в исход 0.
 */
export function sampleHorizonOf(
    now: Date,
    day: string,
    timeZone: string,
): string {
    const dayEnd = portalRangeUtc(day, day, timeZone).to;

    return new Date(Math.min(now.getTime(), dayEnd.getTime())).toISOString();
}

/** Месяц перед месяцем расчёта: 'YYYY-MM' → 'YYYY-MM'. */
export const previousMonthKeyOf = (monthKey: string): string =>
    previousMonthKey(`${monthKey}-01`);
