/**
 * KPI-часть ячейки «менеджер × тип звонка» (план §6.3): факты по кодам
 * item'ов KPI-списка, план CRM и план руководителя, главный факт типа и
 * причина его отсутствия, суммирование ячеек в итоги по типу.
 *
 * Вынесено из `manager-facts.assembler.ts` (Фаза 2, поток 16b): тот
 * собирает KPI-факты периода целиком, этот — только ячейку типа, иначе
 * файл не влезает в лимит «≤ 300 строк». Реэкспорт из
 * `manager-facts.assembler` сохраняет прежние импорты соседей.
 *
 * Чистые функции.
 */
import {
    AI_ANALYTICS_EVENT_KINDS,
    CallReportCallTypeCode,
    type AiAnalyticsKpiEventTypeCode,
} from '@lib/portal-lib/pbx/pbx-aicall-smart';
import { AiCellKpiDto } from '../../dto/ai-manager-type-cell.dto';
import type { AiPlanManagerTargets } from '../loaders/plans.types';
import type { ManagerKpiPeriod } from './overview-model.types';

/** План CRM по KPI-коду (только у кодов с парой *_plan в kpi-report). */
function planCrmFor(kpi: ManagerKpiPeriod, code: string): number | undefined {
    switch (code) {
        case 'call':
            return kpi.calls.plan;
        case 'presentation':
            return kpi.presentations.plan;
        case 'presentation_uniq':
            return kpi.presentationsUniq.plan;
        case 'presentation_contact_uniq':
            return kpi.presentationsContactUniq.plan;
        default:
            return undefined;
    }
}

/** План руководителя по KPI-коду (calls_done → call, presentations_done → presentation_uniq). */
function planHeadFor(
    plans: AiPlanManagerTargets | undefined,
    code: string,
): number | undefined {
    if (!plans) return undefined;
    if (code === 'call') return plans.calls ?? undefined;
    if (code === 'presentation_uniq') return plans.presentations ?? undefined;
    return undefined;
}

/** KPI-часть ячейки: факты по кодам, главный факт и причина его отсутствия. */
export interface CellKpiPart {
    kpi: AiCellKpiDto[];
    primaryKpi: AiCellKpiDto | null;
    kpiReason: string | null;
}

/** KPI-факты ячейки типа в порядке карты + главный факт. */
export function toCellKpi(
    kind: CallReportCallTypeCode,
    kpi: ManagerKpiPeriod | undefined,
    plans: AiPlanManagerTargets | undefined,
): CellKpiPart {
    const definition = AI_ANALYTICS_EVENT_KINDS[kind];
    const fact = kpi?.byType[kind];
    const doneByCode = new Map(
        (fact?.kpi ?? []).map(item => [item.code, item.done]),
    );
    // Явный тип: индексирование карты union-ключом даёт union readonly-
    // массивов, и .map() по нему выводит элемент как any.
    const codes: readonly AiAnalyticsKpiEventTypeCode[] =
        definition.kpiEventTypeCodes;
    const items: AiCellKpiDto[] = codes.map(code => {
        const done = doneByCode.get(code);
        const planCrm = kpi ? planCrmFor(kpi, code) : undefined;
        const planHead = planHeadFor(plans, code);
        return {
            code,
            fact: done ?? null,
            ...(done === undefined
                ? { reason: `kpi-item-missing:${code}` }
                : {}),
            ...(planCrm !== undefined ? { planCrm } : {}),
            ...(planHead !== undefined ? { planHead } : {}),
        };
    });
    const primaryCode = definition.kpiPrimaryEventTypeCode;
    if (primaryCode === null) {
        return {
            kpi: items,
            primaryKpi: null,
            kpiReason: definition.kpiReason,
        };
    }
    const primary = items.find(item => item.code === primaryCode) ?? null;
    return {
        kpi: items,
        primaryKpi: primary?.fact === null ? null : primary,
        kpiReason:
            primary === null || primary.fact === null
                ? `kpi-item-missing:${primaryCode}`
                : null,
    };
}

/** Пустая KPI-часть для типа вне справочника. */
export const emptyCellKpi = (): CellKpiPart => ({
    kpi: [],
    primaryKpi: null,
    kpiReason: null,
});

/** Сумма KPI-фактов ячейки по менеджерам (итоги по типу). */
export function sumCellKpi(cells: readonly AiCellKpiDto[][]): AiCellKpiDto[] {
    const byCode = new Map<string, AiCellKpiDto>();
    for (const cell of cells) {
        for (const item of cell) {
            const current = byCode.get(item.code);
            if (!current) {
                byCode.set(item.code, { ...item });
                continue;
            }
            const fact =
                current.fact === null && item.fact === null
                    ? null
                    : (current.fact ?? 0) + (item.fact ?? 0);
            const planCrm =
                current.planCrm === undefined && item.planCrm === undefined
                    ? undefined
                    : (current.planCrm ?? 0) + (item.planCrm ?? 0);
            const planHead =
                current.planHead === undefined && item.planHead === undefined
                    ? undefined
                    : (current.planHead ?? 0) + (item.planHead ?? 0);
            byCode.set(item.code, {
                code: item.code,
                fact,
                ...(fact === null && (current.reason ?? item.reason)
                    ? { reason: current.reason ?? item.reason }
                    : {}),
                ...(planCrm !== undefined ? { planCrm } : {}),
                ...(planHead !== undefined ? { planHead } : {}),
            });
        }
    }
    return [...byCode.values()];
}
