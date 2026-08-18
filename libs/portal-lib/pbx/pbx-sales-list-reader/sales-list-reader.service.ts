import { Logger } from '@nestjs/common';
import { BitrixService } from '@lib/bitrix';
import {
    IField,
    IPBXList,
} from '@lib/portal-lib/portal/interfaces/portal.interface';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import {
    SALES_LIST_TECHNICAL_FIELD_CODES,
    SalesListCode,
    SalesListQuery,
    SalesListRecord,
    SalesListRecordField,
} from './type/sales-list-record.type';

const DEFAULT_LIMIT = 20;
/** Лимит длины значения поля в записи (комментарии бывают длинными). */
const FIELD_VALUE_LIMIT = 400;

/**
 * «Робот»-читатель списков отчётности ОП (sales_kpi / sales_history):
 * lists.element.get с фильтрами по канону kpi-report-sales
 * (ReportKpiUseCase) и резолв сырых PROPERTY_N в человекочитаемые записи.
 *
 * Канон фильтров (важно, выверено по kpi-report):
 *  - ключ фильтра свойства — bitrixCamelId поля из слепка портала;
 *  - значения выпадающих списков фильтруются по bitrixId ЭЛЕМЕНТА
 *    (field.items), не по коду и не по названию;
 *  - даты — по полю «Дата события» (event_date) префиксами '>' / '<';
 *    поля нет в слепке — фолбэк на DATE_CREATE записи;
 *  - ответственный — свойство responsible; нет поля — CREATED_BY.
 *
 * Полностью fail-open: список не настроен / Bitrix недоступен → [].
 *
 * НЕ @Injectable: создаётся `new` рядом с BitrixService и PortalModel
 * (правило CLAUDE.md про race condition инстансов битрикса).
 */
export class SalesListReaderService {
    private readonly logger = new Logger(SalesListReaderService.name);

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {}

    async read(
        listCode: SalesListCode,
        query: SalesListQuery,
    ): Promise<SalesListRecord[]> {
        try {
            const list = this.portal.getListByCode(listCode);
            if (!list?.bitrixId) return [];

            const response = (await this.bitrix.listItem.get({
                IBLOCK_ID: String(list.bitrixId),
                filter: this.buildFilter(list, query),
            })) as unknown as { result?: Record<string, unknown>[] };

            const records = (response?.result ?? [])
                .slice(0, query.limit ?? DEFAULT_LIMIT)
                .map(item => this.toRecord(listCode, list, item));
            return this.applyPostFilters(records, query);
        } catch (error) {
            this.logger.warn(
                `Чтение списка ${listCode} не удалось: ${(error as Error).message}`,
            );
            return [];
        }
    }

    /** Записи обоих списков одним вызовом (КПИ + ОП История). */
    async readBoth(query: SalesListQuery): Promise<SalesListRecord[]> {
        return [
            ...(await this.read('sales_kpi', query)),
            ...(await this.read('sales_history', query)),
        ];
    }

    // -----------------------------------------------------------------
    // Фильтр
    // -----------------------------------------------------------------

    private buildFilter(
        list: IPBXList,
        query: SalesListQuery,
    ): Record<string, unknown> {
        const filter: Record<string, unknown> = {};

        if (query.crmRefs?.length) {
            const crm = this.field(list, 'crm');
            if (crm) filter[this.filterKey(crm)] = query.crmRefs;
        }

        if (query.eventTypeCodes?.length) {
            const eventType = this.field(list, 'event_type');
            const ids = this.itemIdsByCodes(eventType, query.eventTypeCodes);
            if (eventType && ids.length) {
                filter[this.filterKey(eventType)] = ids;
            } else {
                // Поле/элементы не резолвятся — фильтр добьёт пост-фильтр
                // по резолвленному коду (см. applyEventTypePostFilter).
                this.logger.warn(
                    `Тип события не резолвится в списке ${list.group}_${list.type} — серверный фильтр пропущен`,
                );
            }
        }

        if (query.eventActionCodes?.length) {
            const eventAction = this.field(list, 'event_action');
            const ids = this.itemIdsByCodes(
                eventAction,
                query.eventActionCodes,
            );
            if (eventAction && ids.length) {
                filter[this.filterKey(eventAction)] = ids;
            } else {
                this.logger.warn(
                    `Действие события не резолвится в списке ${list.group}_${list.type} — серверный фильтр пропущен`,
                );
            }
        }

        if (query.dateFrom || query.dateTo) {
            const eventDate = this.field(list, 'event_date');
            if (eventDate) {
                const key = this.filterKey(eventDate);
                if (query.dateFrom) {
                    filter[`>${key}`] = this.toBitrixDate(query.dateFrom);
                }
                if (query.dateTo) {
                    filter[`<${key}`] = this.toBitrixDate(query.dateTo);
                }
            } else {
                if (query.dateFrom) {
                    filter['>=DATE_CREATE'] = query.dateFrom.toISOString();
                }
                if (query.dateTo) {
                    filter['<=DATE_CREATE'] = query.dateTo.toISOString();
                }
            }
        }

        if (query.responsibleId != null) {
            const responsible = this.field(list, 'responsible');
            if (responsible) {
                filter[this.filterKey(responsible)] = String(
                    query.responsibleId,
                );
            } else {
                filter.CREATED_BY = String(query.responsibleId);
            }
        }

        return filter;
    }

    /**
     * Пост-фильтры по типу/действию события: серверный фильтр мог быть
     * пропущен (кривой слепок) — записи с РЕЗОЛВЛЕННЫМ, но не подходящим
     * кодом отсекаются; записи с нерезолвленным значением остаются
     * (fail-open).
     */
    private applyPostFilters(
        records: SalesListRecord[],
        query: SalesListQuery,
    ): SalesListRecord[] {
        const matches = (
            resolved: string | null,
            wanted: string[] | undefined,
        ): boolean =>
            !wanted?.length ||
            !resolved ||
            wanted.some(code => this.codeMatches(resolved, code));
        return records.filter(
            record =>
                matches(record.eventTypeCode, query.eventTypeCodes) &&
                matches(record.eventActionCode, query.eventActionCodes),
        );
    }

    // -----------------------------------------------------------------
    // Резолв записи
    // -----------------------------------------------------------------

    private toRecord(
        listCode: SalesListCode,
        list: IPBXList,
        item: Record<string, unknown>,
    ): SalesListRecord {
        const eventType = this.resolveEnum(list, item, 'event_type');
        const eventAction = this.resolveEnum(list, item, 'event_action');
        const rawId = item.ID;

        return {
            id:
                typeof rawId === 'string' || typeof rawId === 'number'
                    ? String(rawId)
                    : '',
            listCode,
            name: typeof item.NAME === 'string' ? item.NAME : '',
            createdAt:
                typeof item.DATE_CREATE === 'string' ? item.DATE_CREATE : null,
            eventDate: this.firstScalar(this.rawOf(list, item, 'event_date')),
            eventTypeCode: eventType.code,
            eventTypeName: eventType.name,
            eventActionCode: eventAction.code,
            eventActionName: eventAction.name,
            responsibleId: this.firstScalar(
                this.rawOf(list, item, 'responsible'),
            ),
            crmRefs: this.scalars(this.rawOf(list, item, 'crm')),
            fields: this.resolveContentFields(list, item),
        };
    }

    /** Содержательные поля записи (комментарии, статусы) — без служебных. */
    private resolveContentFields(
        list: IPBXList,
        item: Record<string, unknown>,
    ): SalesListRecordField[] {
        const technical = new Set<string>(SALES_LIST_TECHNICAL_FIELD_CODES);
        const prefix = `${list.group}_${list.type}_`;
        const result: SalesListRecordField[] = [];
        for (const field of list.bitrixfields ?? []) {
            const shortCode = String(field.code).startsWith(prefix)
                ? String(field.code).slice(prefix.length)
                : String(field.code);
            if (technical.has(shortCode)) continue;
            const value = this.resolveValueText(field, item);
            if (!value) continue;
            result.push({
                code: shortCode,
                name: field.name || field.title || shortCode,
                value,
            });
        }
        return result;
    }

    /**
     * Значение поля текстом: выпадающий список — ИМЕНА элементов по
     * bitrixId (канон: значения в записи хранятся id элемента), остальное —
     * склеенные скаляры.
     */
    private resolveValueText(
        field: IField,
        item: Record<string, unknown>,
    ): string | null {
        const raw = item[field.bitrixId] ?? item[field.bitrixCamelId];
        const scalars = this.scalars(raw);
        if (!scalars.length) return null;
        const texts = field.items?.length
            ? scalars.map(value => {
                  const enumItem = field.items.find(
                      entry => String(entry.bitrixId) === String(value),
                  );
                  return enumItem?.name || enumItem?.title || value;
              })
            : scalars;
        const joined = texts.join(', ').trim();
        if (!joined) return null;
        return joined.length > FIELD_VALUE_LIMIT
            ? `${joined.slice(0, FIELD_VALUE_LIMIT)}…`
            : joined;
    }

    /** Выпадающий список → {code, name} элемента по значению в записи. */
    private resolveEnum(
        list: IPBXList,
        item: Record<string, unknown>,
        shortCode: string,
    ): { code: string | null; name: string | null } {
        const field = this.field(list, shortCode);
        if (!field) return { code: null, name: null };
        const value = this.firstScalar(item[field.bitrixId]);
        if (value == null) return { code: null, name: null };
        const enumItem = field.items?.find(
            entry => String(entry.bitrixId) === String(value),
        );
        if (!enumItem) return { code: null, name: String(value) };
        return {
            code: this.stripListPrefix(list, String(enumItem.code)),
            name: enumItem.name || enumItem.title || String(value),
        };
    }

    // -----------------------------------------------------------------
    // Хелперы
    // -----------------------------------------------------------------

    private field(list: IPBXList, shortCode: string): IField | undefined {
        return this.portal.getIdByCodeFieldList(list, shortCode);
    }

    /** Ключ фильтра свойства — bitrixCamelId (канон kpi-report). */
    private filterKey(field: IField): string {
        return field.bitrixCamelId || field.bitrixId;
    }

    /** bitrixId элементов выпадающего списка по кодам (терпим к префиксам). */
    private itemIdsByCodes(
        field: IField | undefined,
        codes: string[],
    ): (string | number)[] {
        if (!field?.items?.length) return [];
        return field.items
            .filter(item =>
                codes.some(code => this.codeMatches(String(item.code), code)),
            )
            .map(item => item.bitrixId);
    }

    /** Код совпадает точно либо как суффикс полного кода `..._{code}`. */
    private codeMatches(itemCode: string, code: string): boolean {
        return itemCode === code || itemCode.endsWith(`_${code}`);
    }

    /** Код элемента без префикса списка (sales_kpi_presentation → presentation). */
    private stripListPrefix(list: IPBXList, code: string): string {
        const prefix = `${list.group}_${list.type}_`;
        return code.startsWith(prefix) ? code.slice(prefix.length) : code;
    }

    private rawOf(
        list: IPBXList,
        item: Record<string, unknown>,
        shortCode: string,
    ): unknown {
        const field = this.field(list, shortCode);
        if (!field) return undefined;
        return item[field.bitrixId] ?? item[field.bitrixCamelId];
    }

    /** Дата для фильтра списка (значения свойств — датой без времени). */
    private toBitrixDate(date: Date): string {
        return date.toISOString().slice(0, 10);
    }

    /** Сырое значение свойства → скаляры ({id: value} объекты Bitrix — в значения). */
    private scalars(raw: unknown): string[] {
        if (raw == null) return [];
        if (Array.isArray(raw)) {
            return raw.flatMap(entry => this.scalars(entry));
        }
        if (typeof raw === 'object') {
            return this.scalars(Object.values(raw));
        }
        if (
            typeof raw !== 'string' &&
            typeof raw !== 'number' &&
            typeof raw !== 'boolean'
        ) {
            return [];
        }
        const text = String(raw).trim();
        return text ? [text] : [];
    }

    private firstScalar(raw: unknown): string | null {
        return this.scalars(raw)[0] ?? null;
    }
}
