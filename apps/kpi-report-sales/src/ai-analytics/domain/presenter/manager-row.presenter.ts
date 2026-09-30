/**
 * Строка менеджера обзора (AiManagerRowDto) из ячеек матрицы, KPI-фактов,
 * финансов, планов, раскладки по отделам и уровня. План руководителя
 * против факта (planTargets) и planHead ячеек — одной формулой, как блок
 * «Планы» (plan-targets.assembler). Сигнал «Внимания» проставляется
 * отдельно (attention.presenter) — он считается по всем строкам сразу.
 * Уровень и стаж — единым правилом с конвейером (level.util: ручной →
 * паспорт месяца → дефолт). Чистые функции.
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
import type { AiPlanTargetCellDto } from '../../dto/ai-plan-target-cell.dto';
import type { AiManagerLevelRecord } from '../../store/ai-analytics-settings.store';
import { NO_PLAN_HEADS } from '../assembler/cell-kpi.assembler';
import {
    emptyCellKpi,
    toCellKpi,
    toDiscipline,
    toFinanceTail,
    toFunnel,
    toFunnelShape,
    type ManagerKpiPeriodFacts,
} from '../assembler/manager-facts.assembler';
import type { ManagerCallFacts } from '../assembler/overview-model.types';
import {
    buildPlanTargets,
    planHeadsByFactKey,
} from '../assembler/plan-targets.assembler';
import type { AiFinanceManagerSummary } from '../loaders/finance.types';
import type { ManagerOrg } from '../loaders/manager-org.loader';
import type { AiPlanManagerTargets } from '../loaders/plans.types';
import { resolveLevel, type LevelPassport } from './level.util';
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
    /** KPI-факты периода со счётчиками kpi-report и границами периода. */
    kpi: ManagerKpiPeriodFacts | undefined;
    plans: AiPlanManagerTargets | undefined;
    finance: AiFinanceManagerSummary | undefined;
    org: ManagerOrg | undefined;
    level: AiManagerLevelRecord | undefined;
    /**
     * Паспорт из месячного снапшота менеджера (месяц конца периода либо
     * прошлый); нет — уровень ручной либо дефолт по стажу.
     */
    passport?: LevelPassport | null;
    callFacts: ManagerCallFacts;
    /** Рабочих дней периода по календарю портала. */
    workdays: number;
    /** Конец периода YYYY-MM-DD (стаж считается до него). */
    periodTo: string;
    /** Медиана оценок команды по типу. */
    teamMedians: ReadonlyMap<string, number | null>;
}

/**
 * План руководителя против факта за период обзора — как блок «Планы».
 * Период — KPI-слоя (он же период обзора), без KPI-фактов — финансов;
 * строка вне ростера (ни того, ни другого) планов не имеет.
 */
export function buildRowPlanTargets(
    input: ManagerRowInput,
): AiPlanTargetCellDto[] {
    const period = input.kpi?.period ?? input.finance?.source;
    if (!period) return [];
    return buildPlanTargets({
        config: input.plans?.config,
        targets: input.plans?.targets,
        counters: input.kpi?.counters,
        finance: input.finance,
        from: period.from,
        to: period.to,
    });
}

/**
 * Ячейки менеджера по всем типам справочника (пустые — без звонков);
 * planHeads — план руководителя на период по innerCode факта.
 */
export function buildManagerCells(
    input: ManagerRowInput,
    planHeads: ReadonlyMap<string, number> = NO_PLAN_HEADS,
): AiManagerTypeCellDto[] {
    const cellsByType = new Map<string, ManagerTypeCell>(
        (input.matrixRow?.byType ?? []).map(cell => [cell.callType, cell]),
    );
    return orderedCallTypes(cellsByType.keys()).map(callType =>
        toCellDto(
            callType,
            cellsByType.get(callType) ?? emptyCellCore(),
            isCallTypeCode(callType)
                ? toCellKpi(callType, input.kpi, planHeads)
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
    const { level, levelSource, tenureMonths, since, sinceSource } =
        resolveLevel(input.level, input.periodTo, input.passport ?? null);
    const planTargets = buildRowPlanTargets(input);
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
        byType: buildManagerCells(input, planHeadsByFactKey(planTargets)),
        funnel: toFunnel(input.kpi),
        finance: toFinanceTail(input.finance),
        discipline: toDiscipline(input.kpi),
        planTargets,
        callsTotal: input.callFacts.callsTotal,
        analyzedCalls: input.matrixRow?.n ?? 0,
        nextStepRate: input.callFacts.nextStepRate,
        // Ссылки на карточки разборов проставляет OverviewUseCase после
        // сборки всех строк одним вызовом SmartLinkLoader
        // (withOverviewRiskCallLinks); до него link = null.
        riskCalls: input.callFacts.riskCalls.map(call => ({
            ...call,
            link: null,
        })),
        recommendations: [],
        ...(since === null ? {} : { since }),
        ...(sinceSource === null ? {} : { sinceSource }),
    };
}
