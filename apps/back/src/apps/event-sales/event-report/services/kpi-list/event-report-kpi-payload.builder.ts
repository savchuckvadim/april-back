import dayjs from 'dayjs';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { toCrmDateTime } from '@/shared/lib/date';
import { KpiEventPayload } from '../../../shared/kpi-list-flow/type/kpi-event-payload.type';
import {
    EventTypeCode,
    EventActionCode,
    OpWorkStatusCode,
    OpResultStatusCode,
    OpFailTypeCode,
    OpProspectsTypeCode,
    OpNoresultReasonCode,
    OpFailReasonCode,
    EventReportEventType,
} from '../../types/event-report.event-codes';
import { EventReportContext } from '../context/event-report.context';
import { DealFlowResult } from '../deal/event-report-deal-flow.service';
import { EnumWorkStatusCode } from '../../../types/report-types';

/**
 * KPI-сценарии (см. event-report-service-map.md «Блок 4»):
 */
export type KpiScenario =
    | 'report'
    | 'unplanned_presentation_plan'
    | 'presentation_done'
    | 'plan'
    | 'final';

/**
 * Маппинг DTO/event-type кодов → коды item списка KPI (`event_type`).
 *
 * Возвращает `null`, если маппинга нет — тогда payload не создаётся.
 */
function mapEventType(type: EventReportEventType | null): EventTypeCode | null {
    if (!type) return null;
    switch (type) {
        case 'xo':
            return 'xo';
        case 'warm':
            return 'call';
        case 'presentation':
            return 'presentation';
        case 'hot':
            return 'call_in_progress';
        case 'moneyAwait':
            return 'call_in_money';
        case 'document':
        case 'supply':
        default:
            return null;
    }
}

function mapWorkStatus(ctx: EventReportContext): OpWorkStatusCode | undefined {
    if (ctx.isSuccessSale) return 'op_status_success';
    if (ctx.isFail) return 'op_status_fail';
    if (ctx.workStatusCode === EnumWorkStatusCode.setAside)
        return 'op_status_in_long';
    if (ctx.planEventType === 'hot') return 'op_status_in_progress';
    if (ctx.planEventType === 'moneyAwait') return 'op_status_money_await';
    if (ctx.isInWork) return 'op_status_in_work';
    return undefined;
}

function mapResultStatus(isResult: boolean): OpResultStatusCode {
    return isResult ? 'op_call_result_yes' : 'op_call_result_no';
}

function mapFailType(
    code: string | null | undefined,
): OpFailTypeCode | undefined {
    if (!code) return undefined;
    const known: ReadonlyArray<OpFailTypeCode> = [
        'garant',
        'no_perspect',
        'go',
        'territory',
        'accountant',
        'autsorc',
        'depend',
        'failure',
        'nofailure',
    ];
    return known.includes(code as OpFailTypeCode)
        ? (code as OpFailTypeCode)
        : undefined;
}

function mapFailReason(
    code: string | null | undefined,
): OpFailReasonCode | undefined {
    if (!code) return undefined;
    const known: ReadonlyArray<OpFailReasonCode> = [
        'fail_notime',
        'c_habit',
        'c_prepay',
        'c_price',
        'to_expensive',
        'to_cheap',
        'nomoney',
        'noneed',
        'lpr',
        'employee',
    ];
    return known.includes(code as OpFailReasonCode)
        ? (code as OpFailReasonCode)
        : undefined;
}

function mapNoresultReason(
    code: string | null | undefined,
): OpNoresultReasonCode | undefined {
    if (!code) return undefined;
    const known: ReadonlyArray<OpNoresultReasonCode> = [
        'secretar',
        'nopickup',
        'nonumber',
        'busy',
        'noresult_notime',
        'nocontact',
        'giveup',
        'bay',
        'wrong',
        'auto',
    ];
    return known.includes(code as OpNoresultReasonCode)
        ? (code as OpNoresultReasonCode)
        : undefined;
}

function mapProspects(
    failTypeCode: string | undefined,
    ctx: EventReportContext,
): OpProspectsTypeCode | undefined {
    if (ctx.isInWork || ctx.isSuccessSale) return undefined;
    if (!failTypeCode) return 'op_prospects_nopersp';
    const m: Partial<Record<string, OpProspectsTypeCode>> = {
        garant: 'op_prospects_garant',
        go: 'op_prospects_go',
        territory: 'op_prospects_territory',
        accountant: 'op_prospects_acountant',
        autsorc: 'op_prospects_autsorc',
        depend: 'op_prospects_depend',
        op_prospects_nophone: 'op_prospects_nophone',
        op_prospects_company: 'op_prospects_company',
        failure: 'op_prospects_fail',
    };
    return m[failTypeCode] ?? 'op_prospects_nopersp';
}

/**
 * Строит payload'ы для каждого требующегося KPI-сценария.
 * Сервис-потребитель просто прогоняет результат через KpiListFlowService.
 */
export class EventReportKpiPayloadBuilder {
    constructor(
        private readonly portal: PortalModel,
        private readonly ctx: EventReportContext,
        private readonly deals: DealFlowResult,
    ) {}

    /** Возвращает упорядоченный список payload'ов для всех применимых сценариев. */
    buildAll(): KpiEventPayload[] {
        const payloads: KpiEventPayload[] = [];

        const reportPayload = this.buildReport();
        if (reportPayload) payloads.push(reportPayload);

        const unplannedPresPlan = this.buildUnplannedPresentationPlan();
        if (unplannedPresPlan) payloads.push(unplannedPresPlan);

        const presDone = this.buildPresentationDone();
        if (presDone) payloads.push(presDone);

        const plan = this.buildPlan();
        if (plan) payloads.push(plan);

        const final = this.buildFinal();
        if (final) payloads.push(final);

        return payloads;
    }

    // ---------- сценарии ----------

    private buildReport(): KpiEventPayload | null {
        const ctx = this.ctx;
        if (ctx.isNew || ctx.isExpired) return null;
        if (ctx.reportEventType === 'presentation') return null;

        const eventType = mapEventType(ctx.reportEventType);
        if (!eventType) return null;

        const action: EventActionCode = ctx.isResult ? 'done' : 'expired';

        return this.assemble({
            scenario: 'report',
            name: ctx.reportEventName || ctx.planEventName,
            eventType,
            action,
            dateForName: ctx.nowDate,
            crm: this.crmLinks(),
        });
    }

    private buildUnplannedPresentationPlan(): KpiEventPayload | null {
        const ctx = this.ctx;
        if (!ctx.isUnplannedPresentation || ctx.isExpired) return null;
        return this.assemble({
            scenario: 'unplanned_presentation_plan',
            name: `Незапланированная презентация ${this.nowFormatted()}`,
            eventType: 'presentation',
            action: 'plan',
            dateForName: ctx.nowDate,
            crm: this.crmLinks(),
        });
    }

    private buildPresentationDone(): KpiEventPayload | null {
        const ctx = this.ctx;
        if (!ctx.isPresentationDone || ctx.isExpired) return null;
        return this.assemble({
            scenario: 'presentation_done',
            name: `Презентация состоялась ${this.nowFormatted()}`,
            eventType: 'presentation',
            action: 'done',
            dateForName: ctx.nowDate,
            crm: this.crmLinks(),
        });
    }

    private buildPlan(): KpiEventPayload | null {
        const ctx = this.ctx;
        if (!ctx.isPlanned) return null;
        if (ctx.isSuccessSale || ctx.isFail) return null;
        const eventType = mapEventType(ctx.planEventType);
        if (!eventType) return null;
        return this.assemble({
            scenario: 'plan',
            name: ctx.planEventName,
            eventType,
            action: ctx.isExpired ? 'pound' : 'plan',
            dateForName: this.parseDeadline(ctx.planDeadline) ?? ctx.nowDate,
            crm: this.crmLinks(),
        });
    }

    private buildFinal(): KpiEventPayload | null {
        const ctx = this.ctx;
        if (!ctx.isSuccessSale && !ctx.isFail) return null;
        const eventType = mapEventType(
            ctx.reportEventType ?? ctx.planEventType,
        );
        if (!eventType) return null;
        return this.assemble({
            scenario: 'final',
            name: ctx.isSuccessSale
                ? `Успешная продажа: ${ctx.reportEventName || ''}`
                : `Отказ: ${ctx.reportEventName || ''}`,
            eventType,
            action: 'done',
            dateForName: ctx.nowDate,
            crm: this.crmLinks(),
        });
    }

    // ---------- helpers ----------

    private assemble(input: {
        scenario: KpiScenario;
        name: string;
        eventType: EventTypeCode;
        action: EventActionCode;
        dateForName: Date;
        crm: Record<string, string>;
    }): KpiEventPayload {
        const ctx = this.ctx;
        const tz = this.portal.getTimezone();
        const failTypeCode = ctx.dto.report?.failType?.current?.code;

        return {
            name: input.name,
            values: {
                event_date: this.formatCrm(ctx.nowDate),
                event_title: input.name,
                plan_date: ctx.planDeadline
                    ? toCrmDateTime(ctx.planDeadline, tz)
                    : null,
                author: ctx.planCreatedById || ctx.planResponsibleId,
                responsible: ctx.planResponsibleId,
                su: ctx.planResponsibleId,
                crm: input.crm,
                crm_company:
                    ctx.entityType === 'company' && ctx.entityId
                        ? { n0: `CO_${ctx.entityId}` }
                        : undefined,
                crm_contact: ctx.dto.report?.contact?.ID
                    ? { n0: `C_${ctx.dto.report.contact.ID}` }
                    : undefined,
                manager_comment: ctx.reportComment,
            },
            items: {
                event_type: input.eventType,
                event_action: input.action,
                op_result_status: mapResultStatus(ctx.isResult),
                op_noresult_reason: mapNoresultReason(
                    ctx.dto.report?.noresultReason?.current?.code,
                ),
                op_work_status: mapWorkStatus(ctx),
                op_fail_type: mapFailType(failTypeCode),
                op_fail_reason: mapFailReason(
                    ctx.dto.report?.failReason?.current?.code,
                ),
                op_prospects_type: mapProspects(failTypeCode, ctx),
            },
        };
    }

    private crmLinks(): Record<string, string> {
        const links: Record<string, string> = {};
        let i = 0;
        const push = (v: string) => {
            links[`n${i++}`] = v;
        };
        if (this.ctx.entityType === 'company' && this.ctx.entityId) {
            push(`CO_${this.ctx.entityId}`);
        }
        if (this.ctx.entityType === 'lead' && this.ctx.entityId) {
            push(`L_${this.ctx.entityId}`);
        }
        if (this.deals.baseDealId) {
            push(`D_${this.deals.baseDealId}`);
        }
        if (this.deals.newPlanPresDealId) {
            push(`D_${this.deals.newPlanPresDealId}`);
        }
        if (this.deals.newUnplannedPresDealId) {
            push(`D_${this.deals.newUnplannedPresDealId}`);
        }
        const reportContact = this.ctx.dto.report?.contact?.ID;
        if (reportContact) {
            push(`C_${reportContact}`);
        }
        return links;
    }

    private formatCrm(d: Date): string {
        return dayjs(d)
            .tz(this.portal.getTimezone())
            .format('DD.MM.YYYY HH:mm:ss');
    }

    private nowFormatted(): string {
        return this.formatCrm(this.ctx.nowDate);
    }

    private parseDeadline(deadline: string): Date | null {
        if (!deadline) return null;
        const d = dayjs(deadline);
        return d.isValid() ? d.toDate() : null;
    }
}
