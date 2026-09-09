/**
 * Доведение расчётов Фазы 2 до строк обзора (поток 16b): нормы рёбер из
 * месячной модели портала, топ-3 рычага из дневного прогноза и профиль
 * стиля из месячного снапшота стиля.
 *
 * Это отдельный проход поверх готовых строк, а не новая сборка строки:
 * `manager-row.presenter` остаётся на своей ответственности (Фаза 1b), а
 * снапшотов может не быть вовсе — тогда проход ничего не меняет и
 * витрина работает как раньше (штатная деградация §5.4).
 *
 * Чистые функции.
 */
import { AI_BETA_SOURCES, tenureBandOf } from '@lib/sales-ai-analytics';
import { AiManagerRowDto } from '../../dto/ai-manager-row.dto';
import { ReadinessDto } from '../../dto/readiness.dto';
import type { AiManagerLevelRecord } from '../../store/ai-analytics-settings.store';
import { toFunnelWithNorms } from '../assembler/funnel-edges.assembler';
import {
    buildManagerNorms,
    type ManagerNorms,
} from '../assembler/norms.assembler';
import type {
    ForecastView,
    ManagerKpiPeriod,
    OverviewSnapshots,
    OverviewSources,
    PortalModelView,
} from '../assembler/overview-model.types';
import { toRecommendations } from './levers.presenter';
import { buildReadiness } from './readiness.util';
import { toStyleProfile } from './style.presenter';

/** Всё, что нужно проходу Фазы 2 сверх самих строк. */
export interface Phase2Context extends OverviewSnapshots {
    /** KPI-факты периода по менеджеру — из них строятся рёбра воронки. */
    kpi: ReadonlyMap<number, ManagerKpiPeriod>;
    /** Уровни менеджеров: из них берётся дата начала стажа. */
    levels: ReadonlyMap<number, AiManagerLevelRecord>;
}

/** Продажи по эпизодам сделок из дневных прогнозов менеджеров. */
export function episodeSalesOf(
    forecasts: ReadonlyMap<string, ForecastView> | undefined,
): number {
    let total = 0;
    for (const forecast of forecasts?.values() ?? []) {
        const done = (forecast as { doneSales?: unknown }).doneSales;
        if (typeof done === 'number' && Number.isFinite(done)) {
            total += Math.max(0, done);
        }
    }

    return total;
}

/** Нормы строки: полоса стажа берётся по стажу самой строки. */
export function normsForRow(
    row: AiManagerRowDto,
    model: PortalModelView | null | undefined,
): ManagerNorms | null {
    return buildManagerNorms(
        model,
        row.managerId,
        tenureBandOf(row.tenureMonths),
    );
}

/** Строка с нормами рёбер, рекомендациями, стилем и датой начала стажа. */
function applyRow(row: AiManagerRowDto, ctx: Phase2Context): AiManagerRowDto {
    const norms = normsForRow(row, ctx.model);
    const since = ctx.levels.get(Number(row.managerId))?.since ?? null;

    return {
        ...row,
        funnel: toFunnelWithNorms(ctx.kpi.get(Number(row.managerId)), norms, {
            ...(ctx.model?.edgeKind ? { estimand: ctx.model.edgeKind } : {}),
        }),
        recommendations: toRecommendations(ctx.forecasts?.get(row.managerId), {
            n: row.analyzedCalls,
        }),
        style: toStyleProfile(ctx.styles?.get(row.managerId)),
        ...(since === null ? {} : { since }),
    };
}

/**
 * Строки обзора с расчётами Фазы 2. Модели портала нет — рёбра остаются
 * долями самоотчёта с `priorSource: 'none'`; прогноза нет — рекомендации
 * пусты; снапшота стиля нет — `style: null`.
 */
export function applyPhase2(
    rows: readonly AiManagerRowDto[],
    ctx: Phase2Context,
): AiManagerRowDto[] {
    return rows.map(row => applyRow(row, ctx));
}

/**
 * Готовность витрины обзора: счётчики окна считает адаптер, продажи
 * приходят из финансов (при пустых финансах — из эпизодов прогноза),
 * состав и гипотеза — из настроек портала, режим β и счётчик до его
 * гейта — из модели портала.
 */
export function buildOverviewReadiness(
    sources: OverviewSources,
    now: Date,
): ReadinessDto {
    const model = sources.snapshots?.model ?? null;
    const betaSource = AI_BETA_SOURCES.find(
        source => source === model?.betaSource,
    );

    return buildReadiness(sources.rows, {
        now,
        enabled: sources.enabled,
        pipelineEnabled: sources.rows.some(row => row.analysisPresent),
        financeSales: sources.finance.managers.reduce(
            (sum, item) => sum + item.salesCount,
            0,
        ),
        episodeSales: episodeSalesOf(sources.snapshots?.forecasts),
        // Праздники в календаре — признак импорта производственного
        // календаря портала: у дефолтного их нет.
        calendarImported: sources.calendar.holidays.length > 0,
        rosterLevels: sources.levels.size,
        rosterConfirmedAt: sources.rosterConfirmedAt ?? '',
        hypothesisPairs: sources.hypothesisPairs ?? 0,
        ...(betaSource === undefined ? {} : { betaSource }),
        betaCountdown: model?.betaCountdown ?? null,
    });
}
