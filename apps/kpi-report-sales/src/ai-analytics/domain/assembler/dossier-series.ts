/**
 * Ряды досье менеджера (план Фазы 3, П4): точки недель и месяцев из
 * снапшотов `ai-analytics-manager-{week,month}` и объём разборов окна
 * для раздела трендов.
 *
 * Объём и оценка периода читаются одинаково для недели и месяца: поля
 * `n`, `nBeforeComparable` и `score` нагрузки. У месяцев, посчитанных до
 * 30.09.2026 (замороженные июль и август), этих полей нет — объём тогда
 * складывается из `byType[].n` (тот же набор сравнимых звонков, разложенный
 * по типам), а оценка честно пустая с причиной `legacy-snapshot`:
 * средневзвешенное из оценок типов собрать нельзя — у типов с малым n
 * значения нет, и число вышло бы выдуманным.
 *
 * Чистые функции: без DI, Bitrix и Prisma. Нагрузки читаются структурно
 * (`unknown` + проверки), как во всём досье.
 */
import type {
    AiDossierSeriesDto,
    AiDossierSeriesPointDto,
} from '../../dto/ai-dossier-parts.dto';
import type { MetricDto } from '../../dto/metric.dto';
import {
    legacyMetric,
    scoreMetricOf,
    type DossierSnapshotView,
} from './dossier.reader';

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const isCount = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0;

/** Сумма `byType[].n` нагрузки; чужие элементы не считаются. */
function typesTotal(payload: Record<string, unknown>): number {
    const cells = Array.isArray(payload.byType) ? payload.byType : [];

    return cells.reduce<number>(
        (sum, cell) => sum + (isRecord(cell) && isCount(cell.n) ? cell.n : 0),
        0,
    );
}

/**
 * Разобранных сравнимых звонков периода: поле `n` нагрузки; нет поля
 * (месяц старого расчёта) — сумма `byType[].n`; чужая форма — 0.
 */
export function analyzedOf(payload: unknown): number {
    if (!isRecord(payload)) return 0;

    return isCount(payload.n) ? payload.n : typesTotal(payload);
}

/** Разборов до границы сравнимости; в старом расчёте месяца нет — 0. */
export function nBeforeComparableOf(payload: unknown): number {
    return isRecord(payload) && isCount(payload.nBeforeComparable)
        ? payload.nBeforeComparable
        : 0;
}

/**
 * Средняя оценка периода: `score` нагрузки как есть; поля нет вовсе
 * (месяц старого расчёта) — пустая метрика с причиной `legacy-snapshot`,
 * чтобы витрина писала «оценки нет в расчёте», а не «мало данных».
 */
export function scoreOfPeriod(payload: unknown): MetricDto {
    return isRecord(payload) && payload.score === undefined
        ? legacyMetric()
        : scoreMetricOf(payload);
}

/** Признак смешанных версий разбора периода; нет поля (месяц) — undefined. */
export function versionsMixedOf(payload: unknown): boolean | undefined {
    return isRecord(payload) && typeof payload.versionsMixed === 'boolean'
        ? payload.versionsMixed
        : undefined;
}

/** Ряд периодов: снапшоты по возрастанию ключа → точки ряда. */
export function toSeriesPoints(
    records: readonly DossierSnapshotView[],
): AiDossierSeriesPointDto[] {
    return [...records]
        .sort((left, right) => left.periodKey.localeCompare(right.periodKey))
        .map(record => {
            const versionsMixed = versionsMixedOf(record.payload);

            return {
                periodKey: record.periodKey,
                n: analyzedOf(record.payload),
                nBeforeComparable: nBeforeComparableOf(record.payload),
                score: scoreOfPeriod(record.payload),
                ...(versionsMixed === undefined ? {} : { versionsMixed }),
            };
        });
}

/** Ряды досье; null — ни недель, ни месяцев за окно нет. */
export function toSeries(
    weeks: readonly DossierSnapshotView[],
    months: readonly DossierSnapshotView[],
): AiDossierSeriesDto | null {
    if (weeks.length === 0 && months.length === 0) return null;

    return {
        weeks: toSeriesPoints(weeks),
        months: toSeriesPoints(months),
    };
}
