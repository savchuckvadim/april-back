import { PBX_SALES_KPI_LIST_FIELD_ITEM_CODES } from '@lib/portal-lib/pbx/pbx-sales-kpi-list/type/pbx-sales-kpi-list-field.type';
import { PBX_SALES_EVENT_FIELD_ITEM_CODES } from '@lib/portal-lib/pbx-domain/field/type/sales/event/pbx-sales-event-field.type';
import {
    KpiEventItemCodes,
    KpiEventPayload,
} from '../../../shared/kpi-list-flow/type/kpi-event-payload.type';
import { EventDocumentKindRule } from '../../types/event-document.kind-rules';
import { EventDocumentContext } from '../context/event-document.context';

/** Строки списков по одному событию «документ сформирован». */
export interface EventDocumentKpiRows {
    /** «ОП История»: строка на каждый документ. */
    readonly history: KpiEventPayload[];
    /** «ОП KPI»: каждый тип один раз на основную сделку (`dedup` заполнен). */
    readonly kpi: KpiEventPayload[];
}

type KpiEventTypeCode = NonNullable<KpiEventItemCodes['event_type']>;

const KPI_ITEM = PBX_SALES_KPI_LIST_FIELD_ITEM_CODES;

/**
 * Строки «ОП KPI» и «ОП История» для документов события.
 *
 * Правила — как в легаси: в «Историю» идёт каждый документ, в KPI каждый
 * тип засчитывается один раз на пару «компания + основная сделка» (тот же
 * код строки, что писал Laravel, — дублей со старыми строками не будет).
 * Вариант «после презентации» пишется только в KPI.
 */
export class EventDocumentKpiPayloadBuilder {
    constructor(private readonly ctx: EventDocumentContext) {}

    build(): EventDocumentKpiRows {
        const history: KpiEventPayload[] = [];
        const kpi: KpiEventPayload[] = [];
        for (const rule of this.ctx.rules) {
            history.push(this.payload(rule.title, rule.kpiEventType, rule));
            kpi.push(this.kpiOnce(rule.title, rule.kpiEventType, rule));
            if (this.ctx.isAfterPresentation && rule.afterPresentation) {
                kpi.push(
                    this.kpiOnce(
                        rule.afterPresentation.title,
                        rule.afterPresentation.kpiEventType,
                        rule,
                    ),
                );
            }
        }
        return { history, kpi };
    }

    private kpiOnce(
        title: string,
        eventType: KpiEventTypeCode,
        rule: EventDocumentKindRule,
    ): KpiEventPayload {
        return {
            ...this.payload(title, eventType, rule),
            dedup: {
                key: `${this.ctx.companyId}_${this.ctx.baseDealId}_${eventType}`,
                scope: 'kpi',
                mode: 'insert-once',
                requireEventTypeItem: true,
            },
        };
    }

    private payload(
        title: string,
        eventType: KpiEventTypeCode,
        rule: EventDocumentKindRule,
    ): KpiEventPayload {
        return {
            name: title,
            values: {
                event_date: this.ctx.documentCrmDateTime,
                event_title: title,
                author: this.ctx.userId,
                responsible: this.ctx.userId,
                su: this.ctx.userId,
                crm: this.crmLinks(),
                crm_company: { n0: `CO_${this.ctx.companyId}` },
                manager_comment: this.ctx.summary,
            },
            items: {
                event_type: eventType,
                event_action: rule.kpiEventAction,
                op_work_status: KPI_ITEM.op_work_status.op_status_in_work,
                op_result_status: KPI_ITEM.op_result_status.op_call_result_yes,
                op_prospects_type:
                    PBX_SALES_EVENT_FIELD_ITEM_CODES.op_prospects_type
                        .op_prospects_good,
            },
        };
    }

    /**
     * Ссылки строки: компания и сделки. Лидов и смартов здесь нет намеренно:
     * поле «CRM» списка на портале может не принимать эти типы, и тогда
     * Битрикс отклоняет строку целиком (gsr, 23.11.2026).
     */
    private crmLinks(): Record<string, string> {
        const links = [`CO_${this.ctx.companyId}`, `D_${this.ctx.baseDealId}`];
        if (this.ctx.isAfterPresentation && this.ctx.presentationDealId) {
            links.push(`D_${this.ctx.presentationDealId}`);
        }
        return Object.fromEntries(
            links.map((link, index) => [`n${index}`, link]),
        );
    }
}
