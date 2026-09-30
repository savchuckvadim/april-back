/**
 * Структурное чтение чужих нагрузок для досье менеджера (план Фазы 3,
 * П4): паспорт, метрика оценки и срез возражений из снапшотов
 * `ai-analytics-manager-{week,month}`.
 *
 * Нагрузки читаются структурно (`unknown` + проверки полей), а не
 * приведением к типам соседних потоков: незнакомое значение статуса,
 * уровня или категории обязано дать пустое поле, а не уронить карточку
 * (§5.4 «штатная деградация»). Ровно тот же приём, что в
 * `trends.presenter.ts`.
 *
 * Чистые функции: без DI, Bitrix и Prisma.
 */
import { ratePctMetric } from '@lib/sales-ai-analytics';
import type { AiDossierPassportDto } from '../../dto/ai-dossier-parts.dto';
import type {
    AiObjectionCategoryDto,
    AiObjectionOutcomesDto,
} from '../../dto/ai-objections.dto';
import type { MetricDto } from '../../dto/metric.dto';

/** Снапшот глазами досье: ключ периода, нагрузка и id записи ais. */
export interface DossierSnapshotView {
    id: string;
    periodKey: string;
    managerId: string | null;
    payload: unknown;
    generatedAt: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

const isFiniteNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);

/** Строковое поле нагрузки; не строка (или пусто) — null. */
function stringOrNull(
    source: Record<string, unknown>,
    field: string,
): string | null {
    const value = source[field];

    return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Числовое поле нагрузки; не конечное число — null. */
function numberOrNull(
    source: Record<string, unknown>,
    field: string,
): number | null {
    const value = source[field];

    return isFiniteNumber(value) ? value : null;
}

/** Пустая метрика: значения нет, объём нулевой, доверие none. */
export function emptyMetric(): MetricDto {
    return { value: null, n: 0, confidence: { level: 'none' } };
}

/**
 * Причина пустой метрики досье: снапшот посчитан старой версией расчёта,
 * в которой этой величины не было (оценка месяца до 30.09.2026, счётчики
 * доли отработанных возражений у старых недель). Витрина пишет «нет в
 * расчёте», а не «мало данных».
 */
export const DOSSIER_METRIC_REASONS = {
    legacySnapshot: 'legacy-snapshot',
} as const;

/** Пустая метрика старого расчёта: none с причиной `legacy-snapshot`. */
export function legacyMetric(): MetricDto {
    return {
        value: null,
        n: 0,
        confidence: {
            level: 'none',
            reason: DOSSIER_METRIC_REASONS.legacySnapshot,
        },
    };
}

/**
 * Метрика оценки из нагрузки снапшота: форма `MetricValue` копируется
 * как есть, всё остальное — пустая метрика (числа наружу из чужой формы
 * не выдумываем).
 */
export function scoreMetricOf(payload: unknown): MetricDto {
    if (!isRecord(payload)) return emptyMetric();
    const score = payload.score;
    if (!isRecord(score)) return emptyMetric();
    const confidence = score.confidence;
    if (!isRecord(confidence) || typeof confidence.level !== 'string') {
        return emptyMetric();
    }
    const level = confidence.level;
    if (level !== 'ok' && level !== 'low' && level !== 'none') {
        return emptyMetric();
    }

    return {
        value: isFiniteNumber(score.value) ? score.value : null,
        n: isFiniteNumber(score.n) ? score.n : 0,
        confidence: {
            level,
            ...(typeof confidence.reason === 'string'
                ? { reason: confidence.reason }
                : {}),
        },
        ...(isFiniteNumber(score.w) ? { w: score.w } : {}),
    };
}

/**
 * Паспорт из нагрузки месяца (`ManagerMonthPayload.passport`); null —
 * шаг паспорта за месяц не отработал либо форма чужая.
 */
export function toPassport(
    payload: unknown,
    managerId: string,
): AiDossierPassportDto | null {
    if (!isRecord(payload)) return null;
    const passport = payload.passport;
    if (!isRecord(passport)) return null;

    return {
        managerId,
        since: stringOrNull(passport, 'since'),
        sinceSource: stringOrNull(passport, 'sinceSource'),
        status: stringOrNull(passport, 'status'),
        leftAt: stringOrNull(passport, 'leftAt'),
        level: stringOrNull(passport, 'level'),
        tenureMonths: numberOrNull(passport, 'tenureMonths'),
        tenureBand: stringOrNull(passport, 'tenureBand'),
    };
}

/** Исходы возражений категории; чужая форма — нули, а не выдуманные числа. */
function outcomesOf(value: unknown): AiObjectionOutcomesDto {
    const source = isRecord(value) ? value : {};
    const count = (field: string): number =>
        isFiniteNumber(source[field]) ? source[field] : 0;

    return {
        continued: count('continued'),
        converted: count('converted'),
        disengaged: count('disengaged'),
        other: count('other'),
    };
}

/** Счётчики доли отработанных: handled = true и всего с известным handled. */
interface HandledCounts {
    handled: number;
    known: number;
}

/**
 * Категория недели на пути к окну: поля DTO, счётчики доли (null — неделя
 * старого расчёта, счётчиков в ней нет) и сколько недель уже сложено.
 */
interface CategoryPart {
    dto: AiObjectionCategoryDto;
    counts: HandledCounts | null;
    weeks: number;
}

/** Категория возражений из нагрузки; без кода категории — отбрасывается. */
function toCategory(value: unknown): CategoryPart[] {
    if (!isRecord(value) || typeof value.category !== 'string') return [];
    const { handled, handledKnown } = value;

    return [
        {
            dto: {
                category: value.category,
                n: isFiniteNumber(value.n) ? value.n : 0,
                calls: isFiniteNumber(value.calls) ? value.calls : 0,
                handledRatePct: isRecord(value.handledRatePct)
                    ? scoreMetricOf({ score: value.handledRatePct })
                    : emptyMetric(),
                outcomes: outcomesOf(value.outcomes),
            },
            counts:
                isFiniteNumber(handled) && isFiniteNumber(handledKnown)
                    ? { handled, known: handledKnown }
                    : null,
            weeks: 1,
        },
    ];
}

/** Сложение двух недель одной категории: счётчики и исходы складываются. */
function sum(left: CategoryPart, right: CategoryPart): CategoryPart {
    const a = left.dto.outcomes;
    const b = right.dto.outcomes;

    return {
        dto: {
            ...left.dto,
            n: left.dto.n + right.dto.n,
            calls: left.dto.calls + right.dto.calls,
            outcomes: {
                continued: a.continued + b.continued,
                converted: a.converted + b.converted,
                disengaged: a.disengaged + b.disengaged,
                other: a.other + b.other,
            },
        },
        counts:
            left.counts === null || right.counts === null
                ? null
                : {
                      handled: left.counts.handled + right.counts.handled,
                      known: left.counts.known + right.counts.known,
                  },
        weeks: left.weeks + right.weeks,
    };
}

/**
 * Доля отработанных по окну: из сложенных счётчиков недель (доли недель
 * между собой не складываются). Одна неделя без счётчиков — её доля как
 * есть; несколько недель, среди которых есть старый расчёт, — пустая
 * метрика с причиной `legacy-snapshot` вместо выдуманного числа.
 */
function handledRateOf(part: CategoryPart): MetricDto {
    if (part.counts !== null) {
        return ratePctMetric(part.counts.handled, part.counts.known);
    }

    return part.weeks === 1 ? part.dto.handledRatePct : legacyMetric();
}

/**
 * Возражения окна: категории недельных нагрузок складываются по коду
 * категории (n, calls и исходы суммируются), доля отработанных
 * пересчитывается из счётчиков `handled` / `handledKnown` недель. Недели
 * считают возражения по тем же звонкам, что и ряды (срез недели строится
 * опциями её матрицы).
 *
 * null — за окно не встретилось ни одной категории.
 */
export function toObjectionCategories(
    records: readonly DossierSnapshotView[],
): AiObjectionCategoryDto[] | null {
    const merged = new Map<string, CategoryPart>();
    for (const record of records) {
        const payload = isRecord(record.payload) ? record.payload : {};
        const list = Array.isArray(payload.objections)
            ? payload.objections
            : [];
        for (const part of list.flatMap(toCategory)) {
            const current = merged.get(part.dto.category);
            merged.set(
                part.dto.category,
                current === undefined ? part : sum(current, part),
            );
        }
    }
    if (merged.size === 0) return null;

    return [...merged.values()]
        .map(part => ({ ...part.dto, handledRatePct: handledRateOf(part) }))
        .sort((left, right) => left.category.localeCompare(right.category));
}
