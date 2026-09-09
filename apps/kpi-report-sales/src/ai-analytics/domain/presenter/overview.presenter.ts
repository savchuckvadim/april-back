/**
 * OverviewSources → AiOverviewDto (план 6.3): матрица и возражения
 * (assembler), строки менеджеров (manager-row.presenter), расчёты Фазы 2
 * поверх строк (overview-phase2.presenter: нормы рёбер, рычаги, стиль),
 * сигналы «Внимания», итоги по типам и отделам, готовность
 * (readiness.util), версии разбора, meta. Периметр requester'а —
 * applyOverviewPerimeter. Чистые функции; «сейчас» приходит параметром.
 */
import {
    isWorkday,
    MatrixOptions,
    shiftDate,
    TypeTotalsCell,
    versionsSignature,
    WorkCalendar,
} from '@lib/sales-ai-analytics';
import { AI_ANALYTICS_CALC_VERSION } from '../../constants/ai-overview.const';
import { AiManagerRowDto } from '../../dto/ai-manager-row.dto';
import {
    AiAnalysisVersionsDto,
    AiDepartmentTotalsDto,
    AiOverviewDto,
    AiTypeTotalsDto,
} from '../../dto/ai-overview.dto';
import { filterByPerimeter, RequesterAccess } from '../access/perimeter.util';
import {
    assembleCallFacts,
    emptyCallFacts,
} from '../assembler/call-facts.assembler';
import { sumCellKpi, sumKpiMonths } from '../assembler/manager-facts.assembler';
import {
    assembleDepartmentTotals,
    assembleMatrix,
} from '../assembler/manager-type-matrix.assembler';
import type { OverviewSources } from '../assembler/overview-model.types';
import type { DatedLiteRow } from '../loaders/lite-row.mapper';
import { withSignals } from './attention.presenter';
import { buildManagerRow } from './manager-row.presenter';
import {
    applyPhase2,
    buildOverviewReadiness,
    type Phase2Context,
} from './overview-phase2.presenter';
import { resolveComparableFrom } from './readiness.util';
import {
    emptyCellCore,
    median,
    orderedCallTypes,
    toCellDto,
} from './type-cell.presenter';
import { emptyCellKpi } from '../assembler/manager-facts.assembler';

/** Рабочих дней [from; to] по календарю портала. */
export function countWorkdays(
    from: string,
    to: string,
    calendar: WorkCalendar,
): number {
    let count = 0;
    for (let day = from; day <= to; day = shiftDate(day, 1)) {
        if (isWorkday(day, calendar)) count += 1;
    }
    return count;
}

/** Календарных дней [from; to]. */
export function countDays(from: string, to: string): number {
    const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
    return Math.round(ms / 86_400_000) + 1;
}

/** Объединение ростера и менеджеров матрицы, строками, по возрастанию id. */
export function unionManagerIds(
    roster: readonly number[],
    fromMatrix: readonly string[],
): string[] {
    return [...new Set([...roster.map(String), ...fromMatrix])].sort(
        (a, b) => Number(a) - Number(b),
    );
}

/** Версии последнего разобранного звонка + число разных сигнатур. */
export function resolveVersions(
    rows: readonly DatedLiteRow[],
): AiAnalysisVersionsDto {
    const analyzed = rows.filter(row => row.analysisPresent);
    const latest = [...analyzed]
        .filter(row => row.versions !== null)
        .sort(
            (a, b) => b.callStartedAt.getTime() - a.callStartedAt.getTime(),
        )[0];
    const versions = latest?.versions ?? {};
    return {
        prompt: versions.prompt ?? null,
        rubric: versions.rubric ?? null,
        registry: versions.registry ?? null,
        attribution: versions.attribution ?? null,
        classifier: versions.classifier ?? null,
        distinct: new Set(analyzed.map(versionsSignature)).size,
    };
}

/** Медиана оценок менеджеров по каждому типу (для «Команда: медиана …»). */
function teamMediansOf(
    rows: readonly AiManagerRowDto[],
): Map<string, number | null> {
    const values = new Map<string, number[]>();
    for (const row of rows) {
        for (const cell of row.byType) {
            if (cell.score.value === null) continue;
            const list = values.get(cell.callType) ?? [];
            list.push(cell.score.value);
            values.set(cell.callType, list);
        }
    }
    return new Map(
        [...values.entries()].map(([callType, list]) => [
            callType,
            median(list),
        ]),
    );
}

/** Итоги по типам: ядро ячейки итога + суммы KPI по строкам группы. */
function toTotals(
    totals: readonly TypeTotalsCell[],
    rows: readonly AiManagerRowDto[],
): AiTypeTotalsDto[] {
    const byType = new Map(totals.map(cell => [cell.callType, cell]));
    return orderedCallTypes(byType.keys()).map(callType => {
        const cell = byType.get(callType);
        const cells = rows.flatMap(row =>
            row.byType.filter(item => item.callType === callType),
        );
        const kpi = sumCellKpi(cells.map(item => item.kpi));
        const primaryCode = cells.find(item => item.primaryKpi)?.primaryKpi
            ?.code;
        return {
            ...toCellDto(callType, cell ?? emptyCellCore(), emptyCellKpi(), {
                teamMedian: null,
            }),
            kpi,
            primaryKpi: kpi.find(item => item.code === primaryCode) ?? null,
            kpiReason: cells[0]?.kpiReason ?? null,
            managers: cell?.managers ?? 0,
        };
    });
}

export function buildOverviewDto(
    sources: OverviewSources,
    now: Date,
): AiOverviewDto {
    const { calendar, rows } = sources;
    const comparableFrom = resolveComparableFrom(rows);
    const matrixOptions: MatrixOptions = {
        timeZone: calendar.timeZone,
        ...(comparableFrom ? { comparableFrom } : {}),
    };
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
    const managerIds = unionManagerIds(
        sources.managerIds,
        matrix.managers.map(row => row.managerId),
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
        levels: sources.levels,
        ...(sources.snapshots ?? {}),
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

    const readiness = buildOverviewReadiness(sources, now);

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
        versions: resolveVersions(rows),
        comparableFrom,
        managers,
        totals: toTotals(matrix.totals, managers),
        departmentTotals,
        objections,
        meta: {
            totalCalls: rows.length,
            analyzedCalls: matrix.analyzed,
            skippedNoManager: matrix.excluded.noManager,
            otherSharePct,
            disagreementsCount: sources.disagreementsCount,
            fromCache: false,
            generatedAt: now.toISOString(),
            confirmedOnly: sources.confirmedOnly,
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
