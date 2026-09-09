/**
 * «Внимание» РОПу над строками обзора (план §3, ТЗ FR-12): строка →
 * AttentionManagerInput (n, звонки в телефонии, доля «шаг с датой» за два
 * окна, риск-звонки, дисциплина CRM) → buildAttention lib → карточки.
 * Строки приходят уже в периметре requester'а, поэтому карточки в нём же.
 *
 * С Фазы 2 (поток 16b) вход дополняется разрывом плана, исходами и
 * нормами уровня — их источник сама строка: рёбра воронки уже несут
 * норму слоя (`levelNorm`) и знаменатель, а план руководителя лежит в
 * KPI-фактах ячейки типа. Ничего доучитывать не нужно, поэтому и ручка
 * «Внимания» поверх кэша обзора получает сигнал `plan_gap` без своих
 * загрузок.
 */
import {
    AttentionLevelNorms,
    AttentionManagerInput,
    AttentionOutcomes,
    AttentionPlanGap,
    buildAttention,
} from '@lib/sales-ai-analytics';
import {
    AI_ANALYTICS_OUTCOME_EDGES,
    AI_ANALYTICS_PLAN_GAP_CODES,
} from '../../constants/ai-norms.const';
import { AiAttentionDto, AiAttentionItemDto } from '../../dto/ai-attention.dto';
import { AiFunnelEdgeDto } from '../../dto/ai-funnel-edge.dto';
import { AiManagerRowDto } from '../../dto/ai-manager-row.dto';
import { AiOverviewDto } from '../../dto/ai-overview.dto';

export function toAttentionInput(row: AiManagerRowDto): AttentionManagerInput {
    return {
        managerId: row.managerId,
        n: row.analyzedCalls,
        callsTotal: row.callsTotal,
        nextStepRate: {
            current: row.nextStepRate.current,
            previous: row.nextStepRate.previous,
        },
        riskCalls: row.riskCalls.map(call => ({
            transcriptionId: call.transcriptionId,
            kind: call.kind,
        })),
        discipline: row.discipline,
    };
}

/** Ребро воронки строки по коду; нет ребра — undefined. */
function edgeOf(
    row: AiManagerRowDto,
    code: string,
): AiFunnelEdgeDto | undefined {
    return row.funnel.find(edge => edge.edge === code);
}

/** Ожидание по норме уровня в единицах исхода: μ слоя × знаменатель ребра. */
function normExpectation(
    edge: AiFunnelEdgeDto | undefined,
): number | undefined {
    return edge?.levelNorm === undefined ? undefined : edge.levelNorm * edge.n;
}

/** План руководителя по KPI-коду из ячеек типов; нет плана — undefined. */
function planHeadOf(row: AiManagerRowDto, code: string): number | undefined {
    for (const cell of row.byType) {
        const item = cell.kpi.find(fact => fact.code === code);
        if (item?.planHead !== undefined) return item.planHead;
    }
    return undefined;
}

/** Исходы периода: счета и продажи по числителям рёбер воронки. */
function outcomesOf(row: AiManagerRowDto): AttentionOutcomes | undefined {
    const invoices = edgeOf(row, AI_ANALYTICS_OUTCOME_EDGES.invoices);
    const deals = edgeOf(row, AI_ANALYTICS_OUTCOME_EDGES.deals);
    return invoices === undefined || deals === undefined
        ? undefined
        : { invoices: invoices.s, deals: deals.s };
}

/** Нормы уровня в тех же единицах, что и исходы; без норм — undefined. */
function levelNormsOf(row: AiManagerRowDto): AttentionLevelNorms | undefined {
    const invoices = normExpectation(
        edgeOf(row, AI_ANALYTICS_OUTCOME_EDGES.invoices),
    );
    const deals = normExpectation(
        edgeOf(row, AI_ANALYTICS_OUTCOME_EDGES.deals),
    );
    if (invoices === undefined && deals === undefined) {
        return undefined;
    }
    return {
        ...(invoices === undefined ? {} : { invoices }),
        ...(deals === undefined ? {} : { deals }),
    };
}

/**
 * Разрыв плана: план руководителя по презентациям против ожидания по
 * норме слоя (то же ребро «звонок → презентация», те же единицы). Нормы
 * или плана нет — сигнала нет.
 */
function planGapOf(row: AiManagerRowDto): AttentionPlanGap | undefined {
    const norm = normExpectation(
        edgeOf(row, AI_ANALYTICS_OUTCOME_EDGES.presentations),
    );
    const planHead = planHeadOf(row, AI_ANALYTICS_PLAN_GAP_CODES.presentations);
    return norm === undefined || planHead === undefined
        ? undefined
        : { norm, planHead };
}

/**
 * Вход «Внимания» Фазы 2: к сигналам Фазы 1 добавляются разрыв плана,
 * исходы и нормы уровня. Норм в строке нет (модели портала нет) — вход
 * совпадает с Фазой 1, новых карточек не появляется.
 */
export function toAttentionInputPhase2(
    row: AiManagerRowDto,
): AttentionManagerInput {
    const planGap = planGapOf(row);
    const levelNorms = levelNormsOf(row);
    // Исходы имеют смысл только вместе с нормами уровня («закрыватель» —
    // это исход не ниже нормы), поэтому без норм они не отдаются и вход
    // совпадает с Фазой 1.
    const outcomes = levelNorms === undefined ? undefined : outcomesOf(row);

    return {
        ...toAttentionInput(row),
        ...(planGap === undefined ? {} : { planGap }),
        ...(outcomes === undefined ? {} : { outcomes }),
        ...(levelNorms === undefined ? {} : { levelNorms }),
    };
}

/** Карточки по строкам (≤ 7, ≤ 3 на менеджера, ранг с 1). */
export function buildAttentionItems(
    rows: readonly AiManagerRowDto[],
): AiAttentionItemDto[] {
    return buildAttention({ managers: rows.map(toAttentionInputPhase2) });
}

/** Старшая (по рангу) карточка каждого менеджера — для signal строки. */
export function topSignalByManager(
    items: readonly AiAttentionItemDto[],
): Map<string, AiAttentionItemDto> {
    const top = new Map<string, AiAttentionItemDto>();
    for (const item of items) {
        if (!top.has(item.managerId)) top.set(item.managerId, item);
    }
    return top;
}

/** Строки с проставленным signal. */
export function withSignals(
    rows: readonly AiManagerRowDto[],
): AiManagerRowDto[] {
    const top = topSignalByManager(buildAttentionItems(rows));
    return rows.map(row => ({
        ...row,
        signal: top.get(row.managerId) ?? null,
    }));
}

/** «Внимание» из обзора, уже отфильтрованного по периметру. */
export function toAttentionDto(overview: AiOverviewDto): AiAttentionDto {
    return {
        from: overview.period.from,
        to: overview.period.to,
        items: buildAttentionItems(overview.managers),
        managersConsidered: overview.managers.length,
    };
}
