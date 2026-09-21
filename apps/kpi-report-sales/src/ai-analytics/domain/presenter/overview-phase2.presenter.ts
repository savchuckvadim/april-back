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
import {
    AI_BETA_SOURCES,
    tenureBandOf,
    type ReadinessWindowCounters,
    type SnapshotReadiness,
} from '@lib/sales-ai-analytics';
import { AiManagerRowDto } from '../../dto/ai-manager-row.dto';
import { ReadinessDto } from '../../dto/readiness.dto';
import { AI_SANITY_DATA_QUALITY } from '../../steps/sanity.types';
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
import { buildReadiness, type ReadinessOptions } from './readiness.util';
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

/** Неотрицательное целое из чужой нагрузки снапшота; иначе 0. */
function counterOf(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
        ? Math.floor(value)
        : 0;
}

/**
 * Счётчики окна готовности из модели портала: её окно — 12 месяцев, а
 * период витрины ограничен тремя, поэтому режим `norms` достижим только
 * по модели (находка M9). Форма нагрузки чужая — читается структурно,
 * неполная деградирует до нулей, и окном остаётся период (§5.4).
 */
export function modelReadinessWindow(
    model: PortalModelView | null | undefined,
): ReadinessWindowCounters | null {
    if (model === null || model === undefined) return null;
    const readiness = model.readiness as Partial<SnapshotReadiness> | undefined;

    return {
        historyMonths: counterOf(readiness?.historyMonths),
        presentations: counterOf(readiness?.presentations),
        months: Array.isArray(model.window) ? model.window.length : 0,
    };
}

/**
 * Вердикт качества данных санити-панели модели: `flagged` — плацебо-тест
 * меток времени нашёл продажи, закрытые раньше объясняющих их активностей
 * (факт — в `sanity.readiness.timestampLeak`). Причина уезжает в баннер
 * витрины отдельной строкой `reasons`.
 */
export function modelDataQualityFlagged(
    model: PortalModelView | null | undefined,
): boolean {
    return (
        model?.sanity?.readiness?.dataQuality === AI_SANITY_DATA_QUALITY.flagged
    );
}

/**
 * Всё, что готовность берёт из модели портала: режим β и счётчик до его
 * гейта, окно счётчиков (12 месяцев), вердикт санити-панели и сам факт
 * наличия модели (кап §5.4). Одна функция на обзор и `/settings`, чтобы
 * в одном интерфейсе не было двух разных режимов готовности.
 */
export function modelReadinessOptions(
    model: PortalModelView | null | undefined,
): Pick<
    ReadinessOptions,
    | 'betaSource'
    | 'betaCountdown'
    | 'modelWindow'
    | 'dataQualityFlagged'
    | 'portalModelPresent'
> {
    const betaSource = AI_BETA_SOURCES.find(
        source => source === model?.betaSource,
    );

    return {
        ...(betaSource === undefined ? {} : { betaSource }),
        betaCountdown: model?.betaCountdown ?? null,
        modelWindow: modelReadinessWindow(model),
        dataQualityFlagged: modelDataQualityFlagged(model),
        portalModelPresent: model !== null && model !== undefined,
    };
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
 * Готовность витрины обзора: окно берётся из модели портала (12 месяцев),
 * а без модели остаётся периодом витрины; продажи приходят из финансов
 * (при пустых финансах — из эпизодов прогноза), состав и гипотеза — из
 * настроек портала, режим β, счётчик до его гейта и вердикт качества
 * данных — из модели портала.
 */
export function buildOverviewReadiness(
    sources: OverviewSources,
    now: Date,
): ReadinessDto {
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
        ...modelReadinessOptions(sources.snapshots?.model ?? null),
    });
}
