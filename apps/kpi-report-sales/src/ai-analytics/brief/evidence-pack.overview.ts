/**
 * Агрегаты по строкам кэша обзора для пакета AI-резюме: одни и те же
 * суммы считаются и для текущего окна, и для прошлого периода
 * (`evidence-pack.prev.ts`), поэтому живут отдельно от правил фактов.
 *
 * Чистые функции: без DI, Bitrix и времени.
 */
import {
    buildAttentionItems,
    topSignalByManager,
} from '../domain/presenter/attention.presenter';
import type { AiManagerRowDto } from '../dto/ai-manager-row.dto';
import type { AiOverviewDto } from '../dto/ai-overview.dto';
import type { MetricDto } from '../dto/metric.dto';

const sum = (values: readonly number[]): number =>
    values.reduce((acc, value) => acc + value, 0);

/** Менеджер в периметре пакета (пусто — все). */
export function inScope(
    managerId: string,
    managerIds: readonly string[],
): boolean {
    return managerIds.length === 0 || managerIds.includes(managerId);
}

/** Строки обзора в периметре пакета. */
export function rowsInScope(
    overview: AiOverviewDto,
    managerIds: readonly string[],
): AiManagerRowDto[] {
    return overview.managers.filter(row => inScope(row.managerId, managerIds));
}

/** Риск-звонки периода по строкам. */
export function sumRiskCalls(rows: readonly AiManagerRowDto[]): number {
    return sum(rows.map(row => row.riskCalls.length));
}

/** Закрытые продажи периода по строкам. */
export function sumSales(rows: readonly AiManagerRowDto[]): number {
    return sum(rows.map(row => row.finance.salesCount));
}

/** Разобранные звонки периода по строкам. */
export function sumAnalyzed(rows: readonly AiManagerRowDto[]): number {
    return sum(rows.map(row => row.analyzedCalls));
}

/**
 * Менеджеры с карточкой «Внимания». Карточки считаются над строками
 * периметра тем же правилом, что и вкладка «Внимание», а не берутся из
 * поля `signal` строки: то поле проставлено по всему обзору, и при
 * обзоре шире периметра число разошлось бы с вкладкой.
 */
export function countSignals(rows: readonly AiManagerRowDto[]): number {
    return topSignalByManager(buildAttentionItems(rows)).size;
}

/** Доля, взвешенная объёмом: значение и суммарное n. */
export interface WeightedRate {
    value: number;
    n: number;
}

/** Метрика в объёме, нужном для взвешивания: значение и его объём. */
export type RateLike = Pick<MetricDto, 'value' | 'n'>;

/**
 * Взвешенное по объёму среднее метрик: Σ(value·n) / Σn по метрикам со
 * значением и n > 0; null — таких метрик нет.
 */
export function weightedRate(
    metrics: readonly RateLike[],
): WeightedRate | null {
    let weighted = 0;
    let total = 0;
    for (const metric of metrics) {
        if (metric.value === null || metric.n <= 0) continue;
        weighted += metric.value * metric.n;
        total += metric.n;
    }

    return total === 0 ? null : { value: weighted / total, n: total };
}

const PERCENT = 100;

/**
 * Доля «шаг с датой» за ВЕСЬ период (доля 0..1): ячейки «менеджер × тип
 * звонка» обзора, взвешенные числом разобранных звонков. Считается
 * одинаково для периода и для прошлого периода — поэтому их можно
 * сравнивать. Окна «последние две недели» строки сюда не идут: они
 * сравнивают части одного периода, а не период с прошлым.
 */
export function nextStepShare(
    rows: readonly AiManagerRowDto[],
): WeightedRate | null {
    const rate = weightedRate(
        rows.flatMap(row =>
            row.byType.map(cell => cell.checklists.nextStepDateRatePct),
        ),
    );

    return rate === null ? null : { value: rate.value / PERCENT, n: rate.n };
}
