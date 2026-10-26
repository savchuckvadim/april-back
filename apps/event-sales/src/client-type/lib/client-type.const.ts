import {
    PBX_SALES_EVENT_FIELD_CODES,
    PBX_SALES_EVENT_FIELD_ITEM_CODES,
    PbxSalesEventFieldItemCode,
} from '@lib/portal-lib/pbx-domain/field/type/sales/event/pbx-sales-event-field.type';

/** Поле «Тип Клиента» — pbx-код, одинаковый у сделки и компании. */
export const CLIENT_TYPE_FIELD_CODE =
    PBX_SALES_EVENT_FIELD_CODES.op_client_type;

/** Код варианта: Бюджетники, Коммерческие, ИП, Физ лицо, Адвокаты. */
export type ClientTypeCode = PbxSalesEventFieldItemCode<'op_client_type'>;

/** Все коды вариантов — для `@IsIn` и Swagger `enum`. */
export const CLIENT_TYPE_CODES = Object.values(
    PBX_SALES_EVENT_FIELD_ITEM_CODES.op_client_type,
) as readonly ClientTypeCode[];

/** Где живёт тип клиента: главное — у компании, сделка его повторяет. */
export const CLIENT_TYPE_ENTITIES = ['deal', 'company'] as const;
export type ClientTypeEntity = (typeof CLIENT_TYPE_ENTITIES)[number];
