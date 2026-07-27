/**
 * Конфиг редактируемых pbx-полей: ЕДИНСТВЕННОЕ место, где перечислено,
 * какие поля каких сущностей можно смотреть/менять из фронта kpi-sales.
 *
 * Коды полей берутся ТОЛЬКО из истинной типизации portal-lib
 * (PBX_SALES_*_FIELD_CODES) — никаких магических строк. Добавить поле =
 * добавить строку конфига (+ при необходимости прокинуть значение в
 * read-DTO финансов); контроллер/сервисы менять не нужно.
 */
import {
    PBX_SALES_KONSTRUCTOR_FIELD_CODES,
    type PbxSalesKonstructorFieldType,
} from '@lib/portal-lib/pbx-domain/field/type/sales/konstructor/pbx-sales-konstructor-field.type';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx-domain/field/type/sales/event/pbx-sales-event-field.type';
import { createEnumObject } from '@lib/portal-lib/pbx-domain/field/type/pbx-field-type.util';

/** Сущности Bitrix, чьи поля поддерживает модуль (масштабируется). */
export const PBX_FIELD_ENTITIES = ['deal', 'company'] as const;
export type PbxFieldEntity = (typeof PBX_FIELD_ENTITIES)[number];
export const PBX_FIELD_ENTITY = Object.freeze(
    createEnumObject(PBX_FIELD_ENTITIES),
);

/** Виды значений редактируемых полей (определяют валидацию и формат записи). */
export const PBX_FIELD_VALUE_KINDS = ['enum', 'date'] as const;
export type PbxFieldValueKind = (typeof PBX_FIELD_VALUE_KINDS)[number];
export const PBX_FIELD_VALUE_KIND = Object.freeze(
    createEnumObject(PBX_FIELD_VALUE_KINDS),
);

export interface EditablePbxFieldConfig {
    /** Семантический код поля (истинная типизация portal-lib). */
    code: string;
    /** На какой сущности живёт значение (читаем и пишем именно туда). */
    entity: PbxFieldEntity;
    valueKind: PbxFieldValueKind;
    /**
     * Требовать подтверждение в UI перед сохранением (поля, влияющие на
     * финансовые расчёты/документы).
     */
    confirm: boolean;
}

/**
 * Редактируемые поля. op_client_type — поле КОМПАНИИ (legacy konstructor
 * ведёт тип клиента именно на компании); contract_* — поля сделки.
 */
export const EDITABLE_PBX_FIELDS: readonly EditablePbxFieldConfig[] = [
    {
        code: PBX_SALES_KONSTRUCTOR_FIELD_CODES.contract_type,
        entity: PBX_FIELD_ENTITY.deal,
        valueKind: PBX_FIELD_VALUE_KIND.enum,
        confirm: true,
    },
    {
        code: PBX_SALES_KONSTRUCTOR_FIELD_CODES.contract_start,
        entity: PBX_FIELD_ENTITY.deal,
        valueKind: PBX_FIELD_VALUE_KIND.date,
        confirm: true,
    },
    {
        code: PBX_SALES_KONSTRUCTOR_FIELD_CODES.contract_end,
        entity: PBX_FIELD_ENTITY.deal,
        valueKind: PBX_FIELD_VALUE_KIND.date,
        confirm: true,
    },
    {
        code: PBX_SALES_EVENT_FIELD_CODES.op_client_type,
        entity: PBX_FIELD_ENTITY.company,
        valueKind: PBX_FIELD_VALUE_KIND.enum,
        confirm: false,
    },
] as const;

/** Коды редактируемых полей (для @IsIn и Swagger enum). */
export const EDITABLE_PBX_FIELD_CODES: readonly string[] =
    EDITABLE_PBX_FIELDS.map(field => field.code);

/** Конфиг поля по коду; undefined — поле не редактируемое. */
export const findEditablePbxField = (
    code: string,
): EditablePbxFieldConfig | undefined =>
    EDITABLE_PBX_FIELDS.find(field => field.code === code);

/** ISO-дата yyyy-MM-dd — единственный принимаемый формат date-значений. */
export const PBX_ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Пустая строка очищает UF-поле в Bitrix (без legacy-хаков с пробелами). */
export const PBX_BITRIX_EMPTY_VALUE = '';

/**
 * Bitrix-типы «датовых» полей портала: contract_start/contract_end на
 * конкретном портале могут быть date ИЛИ datetime (отображаем всегда дату,
 * пишем в формате фактического типа поля). Литералы прижаты `satisfies`
 * к истинной типизации portal-lib — опечатка не соберётся.
 */
export const PBX_PORTAL_DATE_TYPE =
    'date' satisfies PbxSalesKonstructorFieldType;
export const PBX_PORTAL_DATETIME_TYPE =
    'datetime' satisfies PbxSalesKonstructorFieldType;

/** Полночь для записи date-значения в datetime-поле портала. */
export const PBX_DATETIME_MIDNIGHT_SUFFIX = ' 00:00:00';
