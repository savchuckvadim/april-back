/**
 * Строка менеджера обзора (AiManagerRowDto) из ячеек матрицы, KPI-фактов,
 * финансов, планов, раскладки по отделам и уровня. Сигнал «Внимания»
 * проставляется отдельно (attention.presenter) — он считается по всем
 * строкам сразу. Чистые функции.
 */
import {
    aggregateBucketScores,
    isCallTypeCode,
    ManagerMatrixRow,
    ManagerTypeCell,
    scoreMetric,
} from '@lib/sales-ai-analytics';
import { AiManagerRowDto } from '../../dto/ai-manager-row.dto';
import { AiManagerTypeCellDto } from '../../dto/ai-manager-type-cell.dto';
import type { AiManagerLevelRecord } from '../../store/ai-analytics-settings.store';
import {
    emptyCellKpi,
    toCellKpi,
    toDiscipline,
    toFinanceTail,
    toFunnel,
    toFunnelShape,
} from '../assembler/manager-facts.assembler';
import type {
    ManagerCallFacts,
    ManagerKpiPeriod,
} from '../assembler/overview-model.types';
import type { AiFinanceManagerSummary } from '../loaders/finance.types';
import type { ManagerOrg } from '../loaders/manager-org.loader';
import type { AiPlanManagerTargets } from '../loaders/plans.types';
import { resolveLevel } from './level.util';
import {
    emptyCellCore,
    orderedCallTypes,
    toCellDto,
} from './type-cell.presenter';

/** Тип, в ячейке которого отдаётся доля отработанных возражений. */
const HANDLED_RATE_CALL_TYPE = 'refine';

export interface ManagerRowInput {
    managerId: string;
    matrixRow: ManagerMatrixRow | undefined;
    kpi: ManagerKpiPeriod | undefined;
    plans: AiPlanManagerTargets | undefined;
    finance: AiFinanceManagerSummary | undefined;
    org: ManagerOrg | undefined;
    level: AiManagerLevelRecord | undefined;
    callFacts: ManagerCallFacts;
    /** Рабочих дней периода по календарю портала. */
    workdays: number;
    /** Конец периода YYYY-MM-DD (стаж считается до него). */
    periodTo: string;
    /** Медиана оценок команды по типу. */
    teamMedians: ReadonlyMap<string, number | null>;
}

/** Ячейки менеджера по всем типам справочника (пустые — без звонков). */
export function buildManagerCells(
    input: ManagerRowInput,
): AiManagerTypeCellDto[] {
    const cellsByType = new Map<string, ManagerTypeCell>(
        (input.matrixRow?.byType ?? []).map(cell => [cell.callType, cell]),
    );
    return orderedCallTypes(cellsByType.keys()).map(callType =>
        toCellDto(
            callType,
            cellsByType.get(callType) ?? emptyCellCore(),
            isCallTypeCode(callType)
                ? toCellKpi(callType, input.kpi, input.plans)
                : emptyCellKpi(),
            {
                teamMedian: input.teamMedians.get(callType) ?? null,
                ...(callType === HANDLED_RATE_CALL_TYPE
                    ? { handledRatePct: input.callFacts.handledRatePct }
                    : {}),
            },
        ),
    );
}

/** Строка без сигнала «Внимания» (signal = null, ставится позже). */
export function buildManagerRow(input: ManagerRowInput): AiManagerRowDto {
    const { level, levelSource, tenureMonths } = resolveLevel(
        input.level,
        input.periodTo,
    );
    return {
        managerId: input.managerId,
        departmentId: input.org?.departmentId ?? null,
        groupId: input.org?.groupId ?? null,
        level,
        levelSource,
        tenureMonths,
        workdays: input.workdays,
        signal: null,
        keyMetric: input.matrixRow?.score ?? scoreMetric([]),
        funnelShape: toFunnelShape(input.kpi),
        buckets: input.matrixRow?.buckets ?? aggregateBucketScores([]),
        byType: buildManagerCells(input),
        funnel: toFunnel(input.kpi),
        finance: toFinanceTail(input.finance),
        discipline: toDiscipline(input.kpi),
        callsTotal: input.callFacts.callsTotal,
        analyzedCalls: input.matrixRow?.n ?? 0,
        nextStepRate: input.callFacts.nextStepRate,
        riskCalls: input.callFacts.riskCalls,
        recommendations: [],
    };
}
