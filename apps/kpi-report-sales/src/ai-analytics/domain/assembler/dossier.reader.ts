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

/** Категория возражений из нагрузки; без кода категории — отбрасывается. */
function toCategory(value: unknown): AiObjectionCategoryDto[] {
    if (!isRecord(value) || typeof value.category !== 'string') return [];

    return [
        {
            category: value.category,
            n: isFiniteNumber(value.n) ? value.n : 0,
            calls: isFiniteNumber(value.calls) ? value.calls : 0,
            handledRatePct: isRecord(value.handledRatePct)
                ? scoreMetricOf({ score: value.handledRatePct })
                : emptyMetric(),
            outcomes: outcomesOf(value.outcomes),
        },
    ];
}

/**
 * Возражения окна: категории недельных нагрузок складываются по коду
 * категории (n и calls суммируются, исходы — тоже). Доля отработанных
 * по окну не пересчитывается: её знаменатель в нагрузке не лежит,
 * поэтому наружу идёт пустая метрика вместо выдуманного числа.
 *
 * null — за окно не встретилось ни одной категории.
 */
export function toObjectionCategories(
    records: readonly DossierSnapshotView[],
): AiObjectionCategoryDto[] | null {
    const merged = new Map<string, AiObjectionCategoryDto>();
    for (const record of records) {
        const payload = isRecord(record.payload) ? record.payload : {};
        const list = Array.isArray(payload.objections)
            ? payload.objections
            : [];
        for (const category of list.flatMap(toCategory)) {
            const current = merged.get(category.category);
            merged.set(
                category.category,
                current === undefined ? category : sum(current, category),
            );
        }
    }
    if (merged.size === 0) return null;

    return [...merged.values()].sort((left, right) =>
        left.category.localeCompare(right.category),
    );
}

/** Сложение двух срезов одной категории: счётчики складываются. */
function sum(
    left: AiObjectionCategoryDto,
    right: AiObjectionCategoryDto,
): AiObjectionCategoryDto {
    return {
        category: left.category,
        n: left.n + right.n,
        calls: left.calls + right.calls,
        // Доля по окну не восстанавливается из долей недель — честный none.
        handledRatePct: emptyMetric(),
        outcomes: {
            continued: left.outcomes.continued + right.outcomes.continued,
            converted: left.outcomes.converted + right.outcomes.converted,
            disengaged: left.outcomes.disengaged + right.outcomes.disengaged,
            other: left.outcomes.other + right.outcomes.other,
        },
    };
}
