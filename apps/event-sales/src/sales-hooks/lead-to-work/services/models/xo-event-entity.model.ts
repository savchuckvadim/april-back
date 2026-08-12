import { Logger } from '@nestjs/common';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { IField } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { ETimeZone, PortalDeadline } from '@lib/shared/lib/date';
import { findPbxSalesEventField } from '@lib/portal-lib/pbx-domain/field/type/sales/event/pbx-sales-event-field.type';
import {
    EnumXoEventFieldCode,
    XO_EVENT_FIELD_CODES,
    XO_EVENT_PROSPECTS_ITEM_NAME,
    XO_EVENT_WORK_STATUS_ITEM_CODE,
} from '@lib/portal-lib/pbx/pbx-lead-request/type/pbx-xo-event.enum';

/** Сущность CRM, на которую пишутся событийные поля. */
export type XoEventEntityType = 'lead' | 'company' | 'deal';

/** Сырая строка сущности Bitrix (UF-поля читаются по имени). */
export type XoEventRow = Record<string, unknown>;

/** Что известно о событии ХО на момент записи. */
export interface IXoEventContext {
    /** Название события (без префикса «Холодный обзвон»). */
    eventName: string;
    /** Дедлайн обзвона в локали портала. */
    deadline: PortalDeadline;
    responsibleId: number;
    /** Кто инициировал обзвон — поле xo_created. */
    xoCreatedById: number;
    /** Таймзона портала (для строки истории). */
    timezone: ETimeZone;
}

/** Префикс названия события — как в классическом холодном обзвоне. */
const XO_EVENT_TYPE_NAME = 'Холодный обзвон';

/**
 * Событийные поля холодного обзвона для ОДНОЙ сущности (компания, лид или
 * сделка) — типизированный аналог модели классического ХО.
 *
 * Правила, унаследованные от классического ХО:
 *  - поле не установлено/не сопоставлено на портале → молча пропускается;
 *  - `op_history` — накопительная строка, `op_mhistory` — multiple со
 *    свежей записью ПЕРВОЙ (прошлые записи не переписываются);
 *  - у создаваемой сущности (row=null) текущих значений нет — история
 *    начинается с этой записи.
 *
 * Наследники расширяют набор своими полями (см. LeadXoEventEntityModel):
 * список полей у лида шире, чем у компании и сделки.
 */
export class XoEventEntityModel {
    protected readonly logger = new Logger(XoEventEntityModel.name);

    constructor(
        protected readonly portal: PortalModel,
        protected readonly entityType: XoEventEntityType,
        /** Текущее состояние сущности; null — сущность создаётся. */
        protected readonly row: XoEventRow | null,
        /** Контекст события; null — событийные поля не пишутся. */
        protected readonly ctx: IXoEventContext | null,
    ) {}

    /** Готовые к записи поля: `UF_CRM_… → значение`. */
    getFields(): XoEventRow {
        const fields: XoEventRow = {};
        if (!this.ctx) return fields;
        for (const code of XO_EVENT_FIELD_CODES) {
            const name = this.fieldName(code);
            if (!name) continue;
            const value = this.valueOf(code, this.ctx);
            if (value !== undefined) fields[name] = value;
        }
        return fields;
    }

    /** «Холодный обзвон {событие}» — название ХО-сделки и текущего статуса. */
    eventTitle(): string | null {
        if (!this.ctx) return null;
        return `${XO_EVENT_TYPE_NAME} ${this.ctx.eventName}`.trim();
    }

    /* ------------------------------------------------------------------ */

    private valueOf(code: EnumXoEventFieldCode, ctx: IXoEventContext): unknown {
        const deadlineCrm = ctx.deadline.toCrmDateTime();
        switch (code) {
            case EnumXoEventFieldCode.xoName:
            case EnumXoEventFieldCode.callNextName:
                return ctx.eventName;
            case EnumXoEventFieldCode.xoDate:
            case EnumXoEventFieldCode.callNextDate:
            case EnumXoEventFieldCode.callLastDate:
                return deadlineCrm;
            case EnumXoEventFieldCode.xoResponsible:
            case EnumXoEventFieldCode.managerOp:
                return String(ctx.responsibleId);
            case EnumXoEventFieldCode.xoCreated:
                return String(ctx.xoCreatedById);
            case EnumXoEventFieldCode.opHistory:
                return this.nextHistoryString(ctx);
            case EnumXoEventFieldCode.opMHistory:
                return this.nextHistoryList(ctx);
            case EnumXoEventFieldCode.opCurrentStatus:
                return this.eventTitle() ?? undefined;
            case EnumXoEventFieldCode.opWorkStatus:
                return this.itemBitrixIdByCode(
                    EnumXoEventFieldCode.opWorkStatus,
                    XO_EVENT_WORK_STATUS_ITEM_CODE,
                );
            case EnumXoEventFieldCode.opProspectsType:
                return this.prospectsItemBitrixId();
        }
    }

    /** Запись истории: «12 августа, 10:15:00 ХО: {событие} Запланирован на …». */
    protected historyEntry(ctx: IXoEventContext): string {
        const stamp = new Date().toLocaleString('ru-RU', {
            day: '2-digit',
            month: 'long',
            hour: 'numeric',
            minute: 'numeric',
            second: 'numeric',
            timeZone: ctx.timezone,
        });
        return (
            `${stamp} ХО: ${ctx.eventName} ` +
            `Запланирован на ${ctx.deadline.toCrmDateTime()}`
        );
    }

    private nextHistoryString(ctx: IXoEventContext): string {
        const current = this.currentText(EnumXoEventFieldCode.opHistory);
        const entry = this.historyEntry(ctx);
        return current ? `${current} ${entry}` : entry;
    }

    private nextHistoryList(ctx: IXoEventContext): string[] {
        const raw = this.currentValue(EnumXoEventFieldCode.opMHistory);
        const current = (Array.isArray(raw) ? raw : [])
            .map(value => (typeof value === 'string' ? value : String(value)))
            .filter(Boolean);
        // Свежая запись первой — порядок классического ХО.
        return [this.historyEntry(ctx), ...current];
    }

    /** bitrixId item'а по КОДУ справочника (коды items стабильны). */
    protected itemBitrixIdByCode(
        code: EnumXoEventFieldCode,
        itemCode: string,
    ): number | string | undefined {
        const field = this.portalField(code);
        return field?.items.find(item => item.code === itemCode)?.bitrixId;
    }

    /**
     * «Перспективная» в `op_prospects_type`: у этого поля стабильно только
     * НАЗВАНИЕ item'а, поэтому код берём из справочника (литерал — иначе
     * типизированный `findPbxSalesEventField` не сузит items), а на портале
     * ищем уже по коду.
     */
    private prospectsItemBitrixId(): number | string | undefined {
        const templateItem = findPbxSalesEventField(
            'op_prospects_type',
        )?.items.find(item => item.name === XO_EVENT_PROSPECTS_ITEM_NAME);
        if (!templateItem) return undefined;
        return this.itemBitrixIdByCode(
            EnumXoEventFieldCode.opProspectsType,
            templateItem.code,
        );
    }

    /** UF-имя поля сущности; поле не установлено на портале → null. */
    protected fieldName(code: string): string | null {
        const field = this.portalField(code);
        return field ? this.portal.getFieldBitrixId(field) : null;
    }

    protected portalField(code: string): IField | undefined {
        return this.portal.getEntityFieldByCode(this.entityType, code);
    }

    /** Текущее значение поля сущности (для накопительных полей). */
    protected currentValue(code: string): unknown {
        if (!this.row) return undefined;
        const name = this.fieldName(code);
        return name ? this.row[name] : undefined;
    }

    protected currentText(code: string): string {
        const raw = this.currentValue(code);
        return typeof raw === 'string' ? raw.trim() : '';
    }
}
