import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { ETimeZone } from '@lib/shared/lib/date';

// Плагины idempotent: extend() повторно — no-op. Регистрируем явно, чтобы
// не зависеть от порядка импортов (см. lead-request-history.util).
dayjs.extend(utc);
dayjs.extend(timezone);

/** Формат CRM datetime-полей Битрикса (локальное время портала). */
const CRM_DATETIME_FORMAT = 'DD.MM.YYYY HH:mm:ss';
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
    /**
     * Имена сотрудников (id → «Имя Фамилия») для читаемой истории.
     * Имени нет — в запись уйдёт id (страховка, а не пустое место).
     */
    userNames?: Record<number, string>;
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
            this.appendAssignedAt(fields);
            this.appendRequestHistory(fields);
        }
        return fields;
    }

    /**
     * Момент назначения — старт отсчёта SLA принятия. Пишется при КАЖДОМ
     * назначении и передаче: после передачи таймер стартует заново, иначе
     * новый ответственный унаследовал бы чужую просрочку.
     *
     * Почему отдельное поле, а не DATE_MODIFY лида: тот сбивается любой
     * правкой карточки (менеджер поправил телефон — SLA отложился), а
     * стадию лида может двинуть кто угодно, включая конструктор.
     */
    private appendAssignedAt(fields: XoEventRow): void {
        const name = this.fieldName(
            EnumLeadRequestFieldCode.op_lead_assigned_at,
        );
        if (!name) return;
        fields[name] = dayjs()
            .tz(this.leadCtx.timezone)
            .format(CRM_DATETIME_FORMAT);
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
        // Историю читают люди: подставляем имена, id — только если имени нет.
        const actor = (id: number): string | number =>
            this.leadCtx.userNames?.[id] ?? id;
        const text = transferredById
            ? LEAD_REQUEST_HISTORY_TEXT.selfTransferred(
                  actor(transferredById),
                  actor(responsibleId),
              )
            : previousResponsibleId && previousResponsibleId !== responsibleId
              ? LEAD_REQUEST_HISTORY_TEXT.transferred(
                    actor(previousResponsibleId),
                    actor(responsibleId),
                )
              : LEAD_REQUEST_HISTORY_TEXT.assigned(actor(responsibleId));

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
