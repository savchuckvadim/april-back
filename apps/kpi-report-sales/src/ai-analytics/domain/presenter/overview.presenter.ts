/**
 * OverviewSources → AiOverviewDto (план 6.3): матрица и возражения
 * (assembler), строки менеджеров (manager-row.presenter), расчёты Фазы 2
 * поверх строк (overview-phase2.presenter: нормы рёбер, рычаги, стиль),
 * сигналы «Внимания», итоги по типам и отделам, готовность
 * (readiness.util), версии разбора, meta. Периметр строк — фильтр отчёта
 * ∩ список разбора (overview-scope.presenter), периметр requester'а —
 * applyOverviewPerimeter. Чистые функции; «сейчас» приходит параметром.
 */
import type { ManagerTypeMatrixOptions } from '@lib/sales-ai-analytics';
import { AI_ANALYTICS_CALC_VERSION } from '../../constants/ai-overview.const';
import { AiManagerRowDto } from '../../dto/ai-manager-row.dto';
import {
    AiDepartmentTotalsDto,
    AiOverviewDto,
} from '../../dto/ai-overview.dto';
import { filterByPerimeter, RequesterAccess } from '../access/perimeter.util';
import {
    assembleCallFacts,
    emptyCallFacts,
} from '../assembler/call-facts.assembler';
import { sumKpiMonths } from '../assembler/manager-facts.assembler';
import {
    assembleDepartmentTotals,
    assembleMatrix,
} from '../assembler/manager-type-matrix.assembler';
import { withSignals } from './attention.presenter';
import { buildManagerRow } from './manager-row.presenter';
import {
    buildOverviewYoy,
    applyPhase2,
    buildOverviewReadiness,
    type Phase2Context,
} from './overview-phase2.presenter';
import {
    countDays,
    countWorkdays,
    resolveVersions,
    teamMediansOf,
    toTotals,
    unionManagerIds,
} from './overview-parts.presenter';
import { overviewScopeMeta, scopeLiteRows } from './overview-scope.presenter';
import { resolveComparableFrom } from './readiness.util';

// Части сборки вынесены в overview-parts.presenter («≤ 300 строк»);
// реэкспорт сохраняет прежние импорты.
export {
    countDays,
    countWorkdays,
    resolveVersions,
    unionManagerIds,
} from './overview-parts.presenter';

export type { OverviewPresenterSources } from './overview-presenter.types';
import type { OverviewPresenterSources } from './overview-presenter.types';

/**
 * Опции матрицы обзора: граница сравнимости по версии разбора (дата набора
 * версий строки, не день звонка) и порог длительности портала по типам
 * (тот же, что у пульса); без порога — дефолт матрицы 300 с.
 */
function overviewMatrixOptions(
    sources: OverviewPresenterSources,
    comparableFrom: string,
): ManagerTypeMatrixOptions {
    return {
        timeZone: sources.calendar.timeZone,
        ...(comparableFrom ? { comparableVersionFrom: comparableFrom } : {}),
        ...(sources.minDurationSecByType
            ? { minDurationSecByType: sources.minDurationSecByType }
            : {}),
    };
}

export function buildOverviewDto(
    sources: OverviewPresenterSources,
    now: Date,
): AiOverviewDto {
    const { calendar } = sources;
    // Граница сравнимости и версии — по всем разборам портала за период:
    // это свойство конвейера разбора, а не сотрудников периметра.
    const comparableFrom = resolveComparableFrom(sources.rows);
    const rows = scopeLiteRows(sources);
    const matrixOptions = overviewMatrixOptions(sources, comparableFrom);
    const { matrix, objections, otherSharePct } = assembleMatrix(
        rows,
        matrixOptions,
    );
    const callFacts = assembleCallFacts(rows, {
        to: sources.to,
        timeZone: calendar.timeZone,
    });
    const kpiByManager = sumKpiMonths(sources.kpi);
    const financeByManager = new Map(
        sources.finance.managers.map(item => [item.managerId, item]),
    );
    const plansByManager = new Map(
        sources.plans.managers.map(item => [item.managerId, item]),
    );
    const matrixByManager = new Map(
        matrix.managers.map(row => [row.managerId, row]),
    );
    // С периметром lite-строки уже сужены — объединение с матрицей ничего
    // не добавит; строка есть у каждого сотрудника периметра.
    const managerIds = unionManagerIds(
        sources.managerIds,
        sources.scope === undefined
            ? matrix.managers.map(row => row.managerId)
            : [],
    );
    const workdays = countWorkdays(sources.from, sources.to, calendar);

    const buildRows = (
        teamMedians: ReadonlyMap<string, number | null>,
    ): AiManagerRowDto[] =>
        managerIds.map(managerId =>
            buildManagerRow({
                managerId,
                matrixRow: matrixByManager.get(managerId),
                kpi: kpiByManager.get(Number(managerId)),
                plans: plansByManager.get(Number(managerId)),
                finance: financeByManager.get(Number(managerId)),
                org: sources.org.get(Number(managerId)),
                level: sources.levels.get(Number(managerId)),
                passport: sources.passports?.get(managerId) ?? null,
                callFacts:
                    callFacts.get(managerId) ?? emptyCallFacts(managerId),
                workdays,
                periodTo: sources.to,
                teamMedians,
            }),
        );
    // Два прохода: медиана команды известна только после первого.
    // Затем расчёты Фазы 2 (нормы рёбер, рычаги, стиль) — и лишь потом
    // сигналы: разрыв плана считается по норме, попавшей в строку.
    const phase2: Phase2Context = {
        kpi: kpiByManager,
        ...(sources.snapshots ?? {}),
        ...(sources.yoy === undefined ? {} : { yoy: sources.yoy }),
        ...(comparableFrom ? { comparableFrom } : {}),
    };
    const managers = withSignals(
        applyPhase2(buildRows(teamMediansOf(buildRows(new Map()))), phase2),
    );

    const departmentTotals: AiDepartmentTotalsDto[] = assembleDepartmentTotals(
        rows,
        managerIds,
        sources.org,
        matrixOptions,
    ).map(group => ({
        departmentId: group.departmentId,
        managerIds: group.managerIds,
        totals: toTotals(
            group.totals,
            managers.filter(row => group.managerIds.includes(row.managerId)),
        ),
    }));

    const readiness = buildOverviewReadiness(
        sources,
        now,
        sources.stageSources,
    );

    return {
        period: {
            from: sources.from,
            to: sources.to,
            timeZone: calendar.timeZone,
            days: countDays(sources.from, sources.to),
            workdays,
        },
        readiness,
        calcVersion: AI_ANALYTICS_CALC_VERSION,
        versions: resolveVersions(sources.rows),
        comparableFrom,
        managers,
        totals: toTotals(matrix.totals, managers),
        departmentTotals,
        objections,
        // Блок «год назад» по отделу (П3): null — месяцев M−12 нет либо период не месяц.
        yoy: buildOverviewYoy(managers, phase2),
        meta: {
            totalCalls: rows.length,
            analyzedCalls: matrix.analyzed,
            skippedNoManager: matrix.excluded.noManager,
            excludedBeforeComparable: matrix.excluded.beforeComparable,
            excludedShort: matrix.excluded.short,
            excludedNoType: matrix.excluded.noType,
            excludedNoAnalysis: matrix.excluded.noAnalysis,
            otherSharePct,
            disagreementsCount: sources.disagreementsCount,
            fromCache: false,
            generatedAt: now.toISOString(),
            confirmedOnly: sources.confirmedOnly,
            scope: overviewScopeMeta(sources.scope, managers.length),
        },
    };
}

/** Периметр requester'а: персональные строки и возражения; итоги остаются. */
export function applyOverviewPerimeter(
    dto: AiOverviewDto,
    access: RequesterAccess,
    fromCache: boolean,
): AiOverviewDto {
    const visible = (managerId: string): boolean =>
        filterByPerimeter([{ managerId }], access).length > 0;
    return {
        ...dto,
        managers: filterByPerimeter(dto.managers, access),
        departmentTotals: dto.departmentTotals.map(group => ({
            ...group,
            managerIds: group.managerIds.filter(visible),
        })),
        objections: {
            ...dto.objections,
            byManager: filterByPerimeter(dto.objections.byManager, access),
        },
        meta: { ...dto.meta, fromCache },
    };
}
