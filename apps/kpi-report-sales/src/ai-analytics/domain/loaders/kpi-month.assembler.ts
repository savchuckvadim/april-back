/**
 * Чистая сборка KPI-месяца: per-type батч-команды `lists.element.get`
 * (канон kpi-report.use-case.ts: ключ фильтра — bitrixCamelId поля,
 * значения выпадающих списков — bitrixId элемента, даты — `>`/`<` по
 * event_date в DD.MM.YYYY) и раскладка счётчиков по структуре
 * AiKpiManagerMonth. Поля списка резолвит kpi-list-fields.util.ts.
 */
import {
    AI_ANALYTICS_EVENT_KINDS,
    AiAnalyticsKpiEventTypeCode,
    CALL_REPORT_CALL_TYPE_CODES,
    CallReportCallTypeCode,
} from '@lib/portal-lib/pbx/pbx-aicall-smart';
import {
    EnumSalesKpiEventAction,
    EnumSalesKpiEventType,
} from '@lib/portal-lib/pbx/pbx-sales-kpi-list/type/pbx-sales-kpi-list.enum';
import type { FilterInnerCode } from '../../../shared/dto/kpi.dto';
import type { NormalizedReportPeriod } from '../../../shared/lib/date-util';
import type {
    AiKpiCodeFact,
    AiKpiManagerMonth,
    AiKpiPlanFact,
    AiKpiTypeFact,
} from './kpi.types';
import type { KpiListFields } from './kpi-list-fields.util';

export {
    KpiListConfigError,
    resolveKpiListFields,
    SALES_KPI_LIST_CODE,
} from './kpi-list-fields.util';
export type { KpiListFields } from './kpi-list-fields.util';

/** Тип инфоблока универсальных списков (как в kpi-report и bx-list.repository). */
const LISTS_IBLOCK_TYPE_ID = 'lists';
export const LISTS_ELEMENT_GET_METHOD = 'lists.element.get';

/**
 * KPI-коды, которые kpi-report.use-case.ts сливает в одну строку call_done
 * (`site`/`come_call` туда НЕ входят — считаем как есть, план §2.2).
 * Сумма per-type `done` по ним обязана совпадать с call_done.
 */
export const CALL_DONE_MERGED_EVENT_TYPE_CODES = [
    EnumSalesKpiEventType.xo,
    EnumSalesKpiEventType.call,
    EnumSalesKpiEventType.call_in_progress,
    EnumSalesKpiEventType.call_in_money,
] as const satisfies readonly AiAnalyticsKpiEventTypeCode[];

/** innerCode факта kpi-report для KPI-кода (`presentation_uniq` → `presentation_uniq_done`). */
export function doneInnerCode(code: AiAnalyticsKpiEventTypeCode): string {
    return `${code}_${EnumSalesKpiEventAction.done}`;
}

/**
 * Код слит в строку call_done: строка `call_done` отчёта — сумма четырёх
 * типов, а не факт по коду `call`, поэтому из отчёта его брать нельзя.
 */
function isMergedIntoCallDone(code: AiAnalyticsKpiEventTypeCode): boolean {
    return (CALL_DONE_MERGED_EVENT_TYPE_CODES as readonly string[]).includes(
        code,
    );
}

/**
 * Факт `done` по коду: слитые в call_done — только из per-type батча,
 * остальные — строка kpi-report, при её отсутствии батч; undefined — нет ни
 * того, ни другого.
 */
function doneFor(
    code: AiAnalyticsKpiEventTypeCode,
    counters: KpiCounters,
    batchDone: ReadonlyMap<AiAnalyticsKpiEventTypeCode, number>,
): number | undefined {
    if (isMergedIntoCallDone(code)) return batchDone.get(code);
    return counters.get(doneInnerCode(code)) ?? batchDone.get(code);
}

/**
 * KPI-коды карты, которым нужен per-type батч: слитые в call_done и те,
 * у которых нет отдельной строки kpi-report. Коды без item'а на портале
 * пропускаются.
 */
export function codesNeedingBatch(
    reportInnerCodes: ReadonlySet<string>,
    fields: KpiListFields,
): AiAnalyticsKpiEventTypeCode[] {
    const codes = new Set<AiAnalyticsKpiEventTypeCode>();
    for (const kind of Object.values(AI_ANALYTICS_EVENT_KINDS)) {
        for (const code of kind.kpiEventTypeCodes) {
            if (!fields.typeItemIds.has(code)) continue;
            if (
                !isMergedIntoCallDone(code) &&
                reportInnerCodes.has(doneInnerCode(code))
            ) {
                continue;
            }
            codes.add(code);
        }
    }
    return [...codes];
}

export interface PerTypeCommand {
    cmdKey: string;
    managerId: number;
    code: AiAnalyticsKpiEventTypeCode;
    params: Record<string, unknown>;
}

export function perTypeCmdKey(
    managerId: number,
    code: AiAnalyticsKpiEventTypeCode,
): string {
    return `user_${managerId}_type_${doneInnerCode(code)}`;
}

/** Батч-команды `done` по (менеджер × KPI-код) за период — фильтры как в kpi-report. */
export function buildPerTypeCommands(
    fields: KpiListFields,
    managerIds: readonly number[],
    codes: readonly AiAnalyticsKpiEventTypeCode[],
    period: NormalizedReportPeriod,
): PerTypeCommand[] {
    const commands: PerTypeCommand[] = [];
    for (const managerId of managerIds) {
        for (const code of codes) {
            const typeItemId = fields.typeItemIds.get(code);
            if (typeItemId === undefined) continue;
            commands.push({
                cmdKey: perTypeCmdKey(managerId, code),
                managerId,
                code,
                params: {
                    IBLOCK_TYPE_ID: LISTS_IBLOCK_TYPE_ID,
                    IBLOCK_ID: fields.listId,
                    filter: {
                        [fields.responsibleKey]: String(managerId),
                        [fields.actionKey]: fields.doneItemId,
                        [fields.typeKey]: typeItemId,
                        [`>${fields.dateKey}`]: period.bitrixFrom,
                        [`<${fields.dateKey}`]: period.bitrixTo,
                    },
                    select: ['ID'],
                },
            });
        }
    }
    return commands;
}

/** Счётчики kpi-report менеджера по innerCode. */
export type KpiCounters = ReadonlyMap<string, number>;

function counter(counters: KpiCounters, code: FilterInnerCode): number {
    return counters.get(code) ?? 0;
}

function planFact(
    counters: KpiCounters,
    plan: FilterInnerCode,
    done: FilterInnerCode,
): AiKpiPlanFact {
    return { plan: counter(counters, plan), done: counter(counters, done) };
}

function typeFact(
    kind: CallReportCallTypeCode,
    counters: KpiCounters,
    batchDone: ReadonlyMap<AiAnalyticsKpiEventTypeCode, number>,
    fields: KpiListFields,
): AiKpiTypeFact {
    const definition = AI_ANALYTICS_EVENT_KINDS[kind];
    const kpi: AiKpiCodeFact[] = [];
    for (const code of definition.kpiEventTypeCodes) {
        const done = doneFor(code, counters, batchDone);
        if (done === undefined && !fields.typeItemIds.has(code)) continue;
        kpi.push({ code, done: done ?? 0 });
    }
    const primary = definition.kpiPrimaryEventTypeCode;
    if (primary === null) {
        return { kind, kpi, primaryDone: null, reason: definition.kpiReason };
    }
    const primaryFact = kpi.find(fact => fact.code === primary);
    return primaryFact
        ? { kind, kpi, primaryDone: primaryFact.done, reason: null }
        : {
              kind,
              kpi,
              primaryDone: null,
              reason: `kpi-item-missing:${primary}`,
          };
}

/** Раскладка счётчиков kpi-report и per-type батча в строку менеджера за месяц. */
export function assembleKpiManagerMonth(
    managerId: number,
    counters: KpiCounters,
    batchDone: ReadonlyMap<AiAnalyticsKpiEventTypeCode, number>,
    fields: KpiListFields,
): AiKpiManagerMonth {
    const byType = Object.fromEntries(
        CALL_REPORT_CALL_TYPE_CODES.map(kind => [
            kind,
            typeFact(kind, counters, batchDone, fields),
        ]),
    ) as Record<CallReportCallTypeCode, AiKpiTypeFact>;

    const perTypeCallDone = CALL_DONE_MERGED_EVENT_TYPE_CODES.reduce(
        (sum, code) => sum + (batchDone.get(code) ?? 0),
        0,
    );

    return {
        managerId,
        calls: planFact(counters, 'call_plan', 'call_done'),
        presentations: planFact(
            counters,
            'presentation_plan',
            'presentation_done',
        ),
        presentationsUniq: planFact(
            counters,
            'presentation_uniq_plan',
            'presentation_uniq_done',
        ),
        presentationsContactUniq: planFact(
            counters,
            'presentation_contact_uniq_plan',
            'presentation_contact_uniq_done',
        ),
        documents: {
            offers: counter(counters, 'ev_offer_act_send'),
            offersAfterPresentation: counter(
                counters,
                'ev_offer_pres_act_send',
            ),
            invoices: counter(counters, 'ev_invoice_act_send'),
            invoicesAfterPresentation: counter(
                counters,
                'ev_invoice_pres_act_send',
            ),
            contracts: counter(counters, 'ev_contract_act_send'),
        },
        outcomes: {
            success: counter(counters, 'ev_success_done'),
            fail: counter(counters, 'ev_fail_done'),
        },
        byType,
        counters: Object.fromEntries(counters) as Partial<
            Record<FilterInnerCode, number>
        >,
        checks: { perTypeCallDone, callDone: counter(counters, 'call_done') },
    };
}
