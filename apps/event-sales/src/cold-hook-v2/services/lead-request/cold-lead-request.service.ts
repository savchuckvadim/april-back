import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { EnumLeadRequestFieldCode } from '@lib/portal-lib/pbx/pbx-lead-request/type/pbx-lead-request.enum';
import { LeadRequestAcceptService } from '../../../lead-request/services/lead-request-accept.service';
import {
    appendLeadRequestHistory,
    buildLeadRequestHistoryEntry,
    LEAD_REQUEST_HISTORY_TEXT,
} from '../../../shared/lead-request/lead-request-history.util';
import { SalesBatchGroupBuffer } from '../../../shared/batch';

type Row = Record<string, unknown>;

/** Заявка клиента, которая ждёт подтверждения. */
export interface ColdWaitingLead {
    leadId: number;
    /** Ответственный лида до ХО — для записи «ХО передан: A → B». */
    responsibleId: number | null;
    row: Row;
}

/** Пометка принявшего в истории: заявку приняли не кнопкой, а ХО. */
const ADDRESSED_XO_MARK = 'адресный ХО';

/**
 * Заявки клиента при адресном ХО из сделки.
 *
 * Адресный ХО отдаёт работу сотруднику — и это решение владельца 16.09 —
 * считается ПРИНЯТИЕМ заявки. Раньше ХО переводил только сделку: лид
 * оставался на прежнем ответственном с заполненным «Заявка назначена
 * (дата)», и фрейм запирал нового хозяина работы, а SLA гонял заявку по
 * чужой просрочке.
 *
 * Трогаем только ОТКРЫТЫЕ лиды, которые ЖДУТ подтверждения: принятым и
 * закрытым заявкам ХО ничего не меняет. Поля принятия считает тот же план,
 * что у кнопки (`LeadRequestAcceptService.plan`), — стадия «Взята в работу»,
 * статус заявки, время первичной обработки, снятие таймера, «Кто принял».
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

    /** Фаза чтения: ждущие подтверждения открытые лиды клиента. */
    async loadWaiting(leadIds: number[]): Promise<ColdWaitingLead[]> {
        const assignedAt = this.fieldName(
            EnumLeadRequestFieldCode.op_lead_assigned_at,
        );
        if (!leadIds.length || !assignedAt) return [];

        const select = [
            'ID',
            'ASSIGNED_BY_ID',
            'STATUS_ID',
            'STATUS_SEMANTIC_ID',
            assignedAt,
            ...[
                EnumLeadRequestFieldCode.op_lead_firstprepare_history,
                EnumLeadRequestFieldCode.op_lead_firstprepare_long,
                EnumLeadRequestFieldCode.op_lead_site_status,
            ]
                .map(code => this.fieldName(code))
                .filter((name): name is string => Boolean(name)),
        ];
        const response = await this.bitrix.lead.getList(
            { ID: leadIds } as never,
            select,
        );
        const rows = (Array.isArray(response?.result)
            ? response.result
            : []) as unknown as Row[];

        return rows
            .filter(row => this.isOpen(row) && this.text(row[assignedAt]))
            .map(row => ({
                leadId: Number(row.ID),
                responsibleId: Number(row.ASSIGNED_BY_ID) || null,
                row,
            }))
            .filter(lead => lead.leadId > 0);
    }

    /**
     * Фаза записи: лид — новому ответственному, заявка — принята ХО.
     * Команды независимы (ссылок `$result` нет), идут в текущую группу.
     */
    queue(
        hookKey: string,
        leads: ColdWaitingLead[],
        responsibleId: number,
        names: Record<number, string>,
        buffer: SalesBatchGroupBuffer,
    ): void {
        const actor = (id: number): string | number => names[id] ?? id;
        const historyName = this.fieldName(
            EnumLeadRequestFieldCode.op_lead_firstprepare_history,
        );
        const tz = this.portal.getTimezone();

        for (const lead of leads) {
            // План — по лиду КАК ЕСТЬ: время первичной обработки считается
            // от настоящего назначения, а не от записи этого ХО.
            const plan = this.accept.plan(this.portal, lead.row, responsibleId);
            if (plan.already) continue;

            const fields: Row = {
                ...plan.fields,
                ASSIGNED_BY_ID: String(responsibleId),
            };
            if (historyName) {
                // Путь читается по порядку: сначала передача, потом принятие.
                let history = lead.row[historyName];
                if (
                    lead.responsibleId &&
                    lead.responsibleId !== responsibleId
                ) {
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
                fields[historyName] = appendLeadRequestHistory(
                    history,
                    buildLeadRequestHistoryEntry(
                        LEAD_REQUEST_HISTORY_TEXT.accepted(
                            `${actor(responsibleId)} (${ADDRESSED_XO_MARK})`,
                        ),
                        tz,
                    ),
                );
            }

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
    static responsibleIds(leads: ColdWaitingLead[]): number[] {
        return leads
            .map(lead => lead.responsibleId)
            .filter((id): id is number => Boolean(id));
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
