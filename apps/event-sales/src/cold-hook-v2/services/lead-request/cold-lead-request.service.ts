import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { EnumLeadRequestFieldCode } from '@lib/portal-lib/pbx/pbx-lead-request/type/pbx-lead-request.enum';
import {
    ACCEPT_LEAD_STAGE_CODE,
    LeadRequestAcceptService,
} from '../../../lead-request/services/lead-request-accept.service';
import {
    appendLeadRequestHistory,
    buildLeadRequestHistoryEntry,
    LEAD_REQUEST_HISTORY_TEXT,
} from '../../../shared/lead-request/lead-request-history.util';
import { isLeadStatusBefore } from '../../../shared/lead-request/lead-status-order.util';
import {
    isManagerOp,
    managerOpName,
    setManagerOp,
} from '../../../shared/lead-request/manager-op.util';
import { IBatchGroupBuffer } from '../../../shared/batch';

type Row = Record<string, unknown>;

/** Открытая заявка клиента — её забирает адресный ХО. */
export interface ColdOpenLead {
    leadId: number;
    /** Ответственный лида до ХО — для записи «ХО передан: A → B». */
    responsibleId: number | null;
    /** Заполнено «Заявка назначена (дата)» — заявка ждёт подтверждения. */
    waiting: boolean;
    row: Row;
}

/** Пометка принявшего в истории: заявку приняли не кнопкой, а ХО. */
const ADDRESSED_XO_MARK = 'адресный ХО';

/**
 * Заявки клиента при адресном ХО.
 *
 * Адресный ХО отдаёт работу сотруднику и — решение владельца 16.09 —
 * считается ПРИНЯТИЕМ заявки. Раньше ХО переводил только сделку: лид
 * оставался на прежнем ответственном с заполненным «Заявка назначена
 * (дата)», и фрейм запирал нового хозяина работы, а SLA гонял заявку по
 * чужой просрочке.
 *
 * Трогаем ВСЕ ОТКРЫТЫЕ лиды клиента (решение 17.09 «адресный ХО везде»):
 *  - ответственный и запись «передан A → B» — всегда, когда он сменился;
 *  - «Менеджер по продажам Гарант» (`manager_op`) — тот же сотрудник;
 *  - поля принятия — только если заявка ещё не принята после последнего
 *    назначения. Их считает тот же план, что у кнопки
 *    (`LeadRequestAcceptService.plan`): статус заявки, время первичной
 *    обработки, снятие таймера, «Кто принял»;
 *  - статус «Взята в работу» — только если лид стоит раньше него по
 *    воронке: презентацию или переговоры назад не откатываем.
 * Закрытые лиды (сконвертирован / забракован) не трогаем вовсе.
 *
 * Не injectable: портал и bitrix привязаны к домену, приходят снаружи.
 * Чтение — в фазе 1 обработчика, запись — в фазе 2 через общий буфер.
 */
export class ColdLeadRequestV2Service {
    constructor(
        private readonly portal: PortalModel,
        private readonly bitrix: BitrixService,
        private readonly accept: LeadRequestAcceptService,
    ) {}

    /** Фаза чтения: открытые лиды клиента с признаком ожидания. */
    async loadOpen(leadIds: number[]): Promise<ColdOpenLead[]> {
        if (!leadIds.length) return [];
        const assignedAt = this.fieldName(
            EnumLeadRequestFieldCode.op_lead_assigned_at,
        );

        const select = [
            'ID',
            'ASSIGNED_BY_ID',
            'STATUS_ID',
            'STATUS_SEMANTIC_ID',
            ...[
                EnumLeadRequestFieldCode.op_lead_assigned_at,
                EnumLeadRequestFieldCode.op_lead_firstprepare_history,
                EnumLeadRequestFieldCode.op_lead_firstprepare_long,
                EnumLeadRequestFieldCode.op_lead_site_status,
            ]
                .map(code => this.fieldName(code))
                .filter((name): name is string => Boolean(name)),
            ...[managerOpName(this.portal, 'lead')].filter(
                (name): name is string => Boolean(name),
            ),
        ];
        const response = await this.bitrix.lead.getList(
            { ID: leadIds } as never,
            select,
        );
        const rows = (Array.isArray(response?.result)
            ? response.result
            : []) as unknown as Row[];

        return rows
            .filter(row => this.isOpen(row))
            .map(row => ({
                leadId: Number(row.ID),
                responsibleId: Number(row.ASSIGNED_BY_ID) || null,
                waiting: assignedAt
                    ? Boolean(this.text(row[assignedAt]))
                    : false,
                row,
            }))
            .filter(lead => lead.leadId > 0);
    }

    /**
     * Фаза записи: лид — новому ответственному, заявка — принята ХО.
     * Команды независимы (ссылок `$result` нет) и идут в текущую группу —
     * размер группы держит вызывающий.
     */
    queue(
        hookKey: string,
        leads: ColdOpenLead[],
        responsibleId: number,
        names: Record<number, string>,
        buffer: Pick<IBatchGroupBuffer, 'queue'>,
    ): void {
        for (const lead of leads) {
            const fields = this.planFields(lead, responsibleId, names);
            if (!fields) continue;
            const cmd = `xo2_lead_${hookKey}_${lead.leadId}`;
            buffer.queue(() =>
                this.bitrix.batch.lead.update(
                    cmd,
                    lead.leadId,
                    fields as never,
                ),
            );
        }
    }

    /** Лиды, которых касается ХО: их ответственные нужны для имён. */
    static responsibleIds(leads: ColdOpenLead[]): number[] {
        return leads
            .map(lead => lead.responsibleId)
            .filter((id): id is number => Boolean(id));
    }

    /**
     * Поля lead.update; null — лид уже у нужного сотрудника (и менеджером
     * стоит он же) и принят.
     */
    private planFields(
        lead: ColdOpenLead,
        responsibleId: number,
        names: Record<number, string>,
    ): Row | null {
        const reassigned = lead.responsibleId !== responsibleId;
        // «Передан A → B» — только когда было от кого передавать.
        const transferred = reassigned && lead.responsibleId !== null;
        // План — по лиду КАК ЕСТЬ: время первичной обработки считается
        // от настоящего назначения, а не от записи этого ХО.
        const plan = this.accept.plan(this.portal, lead.row, responsibleId);
        const managerStale = !isManagerOp(
            this.portal,
            'lead',
            lead.row,
            responsibleId,
        );
        if (plan.already && !reassigned && !managerStale) return null;

        const fields: Row = plan.already ? {} : { ...plan.fields };
        fields.ASSIGNED_BY_ID = String(responsibleId);
        setManagerOp(this.portal, 'lead', fields, responsibleId);
        if (
            'STATUS_ID' in fields &&
            !isLeadStatusBefore(
                this.portal,
                lead.row.STATUS_ID,
                ACCEPT_LEAD_STAGE_CODE,
            )
        ) {
            delete fields.STATUS_ID;
        }

        const historyName = this.fieldName(
            EnumLeadRequestFieldCode.op_lead_firstprepare_history,
        );
        if (historyName && (transferred || !plan.already)) {
            fields[historyName] = this.history(
                lead,
                historyName,
                responsibleId,
                names,
                { transferred, accepted: !plan.already },
            );
        }
        return fields;
    }

    /** Путь читается по порядку: сначала передача, потом принятие. */
    private history(
        lead: ColdOpenLead,
        historyName: string,
        responsibleId: number,
        names: Record<number, string>,
        what: { transferred: boolean; accepted: boolean },
    ): unknown {
        const actor = (id: number): string | number => names[id] ?? id;
        const tz = this.portal.getTimezone();
        let history = lead.row[historyName];
        if (what.transferred && lead.responsibleId) {
            history = appendLeadRequestHistory(
                history,
                buildLeadRequestHistoryEntry(
                    LEAD_REQUEST_HISTORY_TEXT.transferred(
                        actor(lead.responsibleId),
                        actor(responsibleId),
                    ),
                    tz,
                ),
            );
        }
        if (what.accepted) {
            history = appendLeadRequestHistory(
                history,
                buildLeadRequestHistoryEntry(
                    LEAD_REQUEST_HISTORY_TEXT.accepted(
                        `${actor(responsibleId)} (${ADDRESSED_XO_MARK})`,
                    ),
                    tz,
                ),
            );
        }
        return history;
    }

    /** Закрытый лид (сконвертирован / забракован) не переоткрываем. */
    private isOpen(row: Row): boolean {
        const semantic = this.text(row.STATUS_SEMANTIC_ID).toUpperCase();
        return semantic === '' || semantic === 'P';
    }

    private fieldName(code: EnumLeadRequestFieldCode): string | null {
        const field = this.portal.getEntityFieldByCode('lead', code);
        return field ? this.portal.getFieldBitrixId(field) : null;
    }

    private text(raw: unknown): string {
        return typeof raw === 'string' || typeof raw === 'number'
            ? String(raw).trim()
            : '';
    }
}
