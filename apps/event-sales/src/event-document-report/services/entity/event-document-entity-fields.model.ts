import { IField } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import {
    PBX_SALES_EVENT_FIELD_CODES,
    PBX_SALES_EVENT_FIELD_ITEM_CODES,
} from '@lib/portal-lib/pbx-domain/field/type/sales/event/pbx-sales-event-field.type';
import { SALES_DOCUMENT_KIND } from '@lib/queue';
import { EventDocumentContext } from '../context/event-document.context';

/** Карточки, в которые поток документов пишет поля. */
export type EventDocumentEntityType = 'company' | 'deal';

export type EventDocumentEntityFields = Record<string, string | number>;

/** Карточка из снимка: из неё читаются текущие значения счётчиков. */
type EntityRecord = Readonly<Record<string, unknown>>;

const MONEY_FIELD_TYPE = 'money';
const MONEY_CURRENCY = 'RUB';

/**
 * Поля одной карточки (компании или сделки) по событию «документ
 * сформирован»: счётчики документов, даты, «ОП Текущий статус», статус
 * работы и перспективность.
 *
 * Чистая модель: ничего не читает и не пишет, только превращает контекст и
 * снимок карточки в набор `UF_CRM_*`. Поле, не установленное на портале,
 * молча пропускается — как во всём event-report.
 */
export class EventDocumentEntityFieldsModel {
    private readonly portal: PortalModel;

    constructor(
        private readonly ctx: EventDocumentContext,
        private readonly entityType: EventDocumentEntityType,
        private readonly record: EntityRecord,
    ) {
        this.portal = ctx.portal;
    }

    toFields(): EventDocumentEntityFields {
        const out: EventDocumentEntityFields = {};
        for (const rule of this.ctx.rules) {
            this.increment(out, rule.counterField);
            if (rule.dateField) {
                this.setScalar(
                    out,
                    rule.dateField,
                    this.ctx.documentCrmDateTime,
                );
            }
            if (this.ctx.isAfterPresentation && rule.afterPresentation) {
                this.increment(out, rule.afterPresentation.counterField);
            }
        }
        this.setScalar(
            out,
            PBX_SALES_EVENT_FIELD_CODES.op_current_status,
            this.ctx.statusText,
        );
        // Документ отправлен — клиент в работе и перспективен (как в легаси):
        // отложенный клиент после КП возвращается в работу.
        this.applyEnumeration(
            out,
            PBX_SALES_EVENT_FIELD_CODES.op_work_status,
            PBX_SALES_EVENT_FIELD_ITEM_CODES.op_work_status.work,
        );
        this.applyEnumeration(
            out,
            PBX_SALES_EVENT_FIELD_CODES.op_prospects_type,
            PBX_SALES_EVENT_FIELD_ITEM_CODES.op_prospects_type
                .op_prospects_good,
        );
        this.applyOfferSum(out);
        return out;
    }

    /** «Сумма предложения» — только у сделок и только когда сформировано КП. */
    private applyOfferSum(out: EventDocumentEntityFields): void {
        const sum = this.ctx.sum;
        if (sum === null || this.entityType !== 'deal') return;
        if (!this.ctx.kinds.includes(SALES_DOCUMENT_KIND.offer)) return;
        const field = this.findField(PBX_SALES_EVENT_FIELD_CODES.offer_sum);
        if (!field) return;
        out[this.portal.getFieldBitrixId(field)] =
            field.type === MONEY_FIELD_TYPE ? `${sum}|${MONEY_CURRENCY}` : sum;
    }

    /** Счётчик: «значение из снимка + 1». */
    private increment(out: EventDocumentEntityFields, code: string): void {
        const field = this.findField(code);
        if (!field) return;
        const key = this.portal.getFieldBitrixId(field);
        // Несколько документов одного события не должны затирать друг
        // друга: второй прибавляет к уже посчитанному значению.
        const current = Number(out[key] ?? this.record[key]) || 0;
        out[key] = current + 1;
    }

    private setScalar(
        out: EventDocumentEntityFields,
        code: string,
        value: string,
    ): void {
        const field = this.findField(code);
        if (!field || !value) return;
        out[this.portal.getFieldBitrixId(field)] = value;
    }

    private applyEnumeration(
        out: EventDocumentEntityFields,
        code: string,
        itemCode: string,
    ): void {
        const field = this.findField(code);
        if (!field) return;
        const item = this.portal.getFieldItemByCode(field, itemCode);
        if (item?.bitrixId == null) return;
        out[this.portal.getFieldBitrixId(field)] = item.bitrixId;
    }

    private findField(code: string): IField | undefined {
        return this.portal.getEntityFieldByCode(this.entityType, code);
    }
}
