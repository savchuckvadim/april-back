import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { ETimeZone } from '@lib/shared/lib/date';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx';
import {
    EnumLeadOpStatusCode,
    EnumLeadRequestFieldCode,
    EnumLeadSiteStageCode,
    EnumLeadSiteStatusCode,
} from '@lib/portal-lib/pbx/pbx-lead-request/type/pbx-lead-request.enum';
import {
    appendLeadRequestHistory,
    buildLeadRequestHistoryEntry,
    LEAD_REQUEST_HISTORY_TEXT,
} from '../../../../shared/lead-request/lead-request-history.util';
import {
    IXoEventContext,
    XoEventEntityModel,
    XoEventRow,
} from './xo-event-entity.model';

/** Что лид получает сверх общих событийных полей ХО. */
export interface ILeadEntityContext {
    /**
     * Контекст события обзвона; null — дедлайна нет либо это не ХО-ветка:
     * событийные поля не пишутся, поля заявки пишутся всегда.
     */
    eventCtx: IXoEventContext | null;
    /** Писать ли событийные поля ХО (ветка isXo=Y). */
    withXoEventFields: boolean;
    /** Лид распознан как заявка — только тогда ставятся site-метки. */
    isRequest: boolean;
    /** Ссылка на основную сделку (`D_123` либо `D_$result[cmd]`). */
    baseDealRef: string | null;
    /** Ссылка на ХО-сделку. */
    xoDealRef: string | null;
    /** У лида есть компания (своя или создаваемая) — «Работа с компанией». */
    hasCompany: boolean;
    /** Прежний ответственный при передаче обзвона; null — первое назначение. */
    previousResponsibleId: number | null;
    /** Сотрудник сам передал заявку (кнопка «Передать другому»). */
    transferredById: number | null;
    responsibleId: number;
    /** TZ портала для стампа записи истории заявки. */
    timezone: ETimeZone;
}

/**
 * Модель ЛИДА в хуке «лид → работа»: событийные поля обзвона (наследуются
 * от {@link XoEventEntityModel}, только в ХО-ветке) ПЛЮС весь пакет полей
 * заявки. Набор у лида шире, чем у компании и сделки, поэтому модель своя.
 *
 * Поля заявки (пишутся в обеих ветках):
 *  - `to_base_sales` / `to_xo_sales` — обратные ссылки на работу;
 *  - `op_lead_is_company` + `op_lead_status` («Работа со сделкой»/«…с компанией»);
 *  - `op_lead_site_status`/`op_lead_site_stage` — первичные метки заявки
 *    («Появилась» / «Назначена менеджеру»), ТОЛЬКО в пустые поля:
 *    «Взята в работу» — факт принятия, его ставит /lead-request/accept;
 *  - `op_lead_firstprepare_history` — append-запись «ХО назначен/передан»
 *    (прошлые записи никогда не переписываются).
 *
 * Любое неустановленное на портале поле молча пропускается (graceful).
 */
export class LeadXoEventEntityModel extends XoEventEntityModel {
    constructor(
        portal: PortalModel,
        row: XoEventRow | null,
        private readonly leadCtx: ILeadEntityContext,
    ) {
        super(portal, 'lead', row, leadCtx.eventCtx);
    }

    /** Событийные поля ХО (если ветка ХО) + поля заявки одним объектом. */
    override getFields(): XoEventRow {
        const fields = this.leadCtx.withXoEventFields ? super.getFields() : {};
        this.appendWorkLinks(fields);
        this.appendSiteMarks(fields);
        if (this.leadCtx.withXoEventFields) {
            this.appendRequestHistory(fields);
        }
        return fields;
    }

    /** Связи с работой и агрегированный статус лида. */
    private appendWorkLinks(fields: XoEventRow): void {
        const base = this.fieldName(PBX_SALES_EVENT_FIELD_CODES.to_base_sales);
        if (base && this.leadCtx.baseDealRef) {
            fields[base] = this.leadCtx.baseDealRef;
        }
        const xo = this.fieldName(PBX_SALES_EVENT_FIELD_CODES.to_xo_sales);
        if (xo && this.leadCtx.xoDealRef) {
            fields[xo] = this.leadCtx.xoDealRef;
        }

        const isCompany = this.fieldName(
            EnumLeadRequestFieldCode.op_lead_is_company,
        );
        if (isCompany && this.leadCtx.hasCompany) {
            fields[isCompany] = 1;
        }

        const statusName = this.fieldName(
            EnumLeadRequestFieldCode.op_lead_status,
        );
        if (statusName) {
            const bitrixId = this.leadItemBitrixId(
                EnumLeadRequestFieldCode.op_lead_status,
                this.leadCtx.hasCompany
                    ? EnumLeadOpStatusCode.companyWork
                    : EnumLeadOpStatusCode.dealWork,
            );
            if (bitrixId !== undefined) fields[statusName] = bitrixId;
        }
    }

    /**
     * Первичные метки заявки — только у распознанной заявки и только в
     * ПУСТЫЕ поля: путь заявки не переписывается задним числом.
     */
    private appendSiteMarks(fields: XoEventRow): void {
        if (!this.leadCtx.isRequest || !this.leadCtx.withXoEventFields) return;
        const marks: [code: EnumLeadRequestFieldCode, itemCode: string][] = [
            [
                EnumLeadRequestFieldCode.op_lead_site_status,
                EnumLeadSiteStatusCode.appeared,
            ],
            [
                EnumLeadRequestFieldCode.op_lead_site_stage,
                EnumLeadSiteStageCode.assigned,
            ],
        ];
        for (const [code, itemCode] of marks) {
            const name = this.fieldName(code);
            if (!name || this.currentValue(code)) continue;
            const bitrixId = this.leadItemBitrixId(code, itemCode);
            if (bitrixId !== undefined) fields[name] = bitrixId;
        }
    }

    /** История обработки заявки: назначение / передача / самопередача. */
    private appendRequestHistory(fields: XoEventRow): void {
        const name = this.fieldName(
            EnumLeadRequestFieldCode.op_lead_firstprepare_history,
        );
        if (!name) return;

        const { previousResponsibleId, transferredById, responsibleId } =
            this.leadCtx;
        const text = transferredById
            ? LEAD_REQUEST_HISTORY_TEXT.selfTransferred(
                  transferredById,
                  responsibleId,
              )
            : previousResponsibleId && previousResponsibleId !== responsibleId
              ? LEAD_REQUEST_HISTORY_TEXT.transferred(
                    previousResponsibleId,
                    responsibleId,
                )
              : LEAD_REQUEST_HISTORY_TEXT.assigned(responsibleId);

        fields[name] = appendLeadRequestHistory(
            this.currentValue(
                EnumLeadRequestFieldCode.op_lead_firstprepare_history,
            ),
            buildLeadRequestHistoryEntry(text, this.leadCtx.timezone),
        );
    }

    /** bitrixId item'а поля ЛИДА по коду справочника. */
    private leadItemBitrixId(
        code: EnumLeadRequestFieldCode,
        itemCode: string,
    ): number | string | undefined {
        const field = this.portalField(code);
        return field?.items.find(item => item.code === itemCode)?.bitrixId;
    }
}
