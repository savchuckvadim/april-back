/**
 * Фейковые поля портала: коды полей документов, их типы и варианты перечислений.
 */
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx-domain/field/type/sales/event/pbx-sales-event-field.type';
import { PBX_SALES_KONSTRUCTOR_FIELD_CODES } from '@lib/portal-lib/pbx-domain/field/type/sales/konstructor/pbx-sales-konstructor-field.type';
import {
    PROSPECTS_GOOD_ITEM_BITRIX_ID,
    WORK_STATUS_ITEM_BITRIX_ID,
} from './document-scenario.fixture';

const KONSTRUCTOR_FIELD = PBX_SALES_KONSTRUCTOR_FIELD_CODES;
const EVENT_FIELD = PBX_SALES_EVENT_FIELD_CODES;

// === Поля портала ===
export interface FakeFieldItem {
    code: string;
    bitrixId: number;
}

export interface FakeField {
    code: string;
    type: string;
    bitrixId: string;
    items: FakeFieldItem[];
}

export type FakeFieldMap = Record<string, FakeField>;

/** Ключ поля в записи Битрикса: у фейков bitrixId = код в верхнем регистре. */
export const fieldKey = (code: string): string =>
    `UF_CRM_${code.toUpperCase()}`;

export const DOCUMENT_COUNTER_CODES = [
    KONSTRUCTOR_FIELD.op_offer_q,
    KONSTRUCTOR_FIELD.op_invoice_q,
    KONSTRUCTOR_FIELD.op_contract_q,
    KONSTRUCTOR_FIELD.op_supplies_q,
    KONSTRUCTOR_FIELD.op_offer_pres_q,
    KONSTRUCTOR_FIELD.op_invoice_pres_q,
] as const;

export const DOCUMENT_DATE_CODES = [
    KONSTRUCTOR_FIELD.op_offer_date,
    KONSTRUCTOR_FIELD.op_invoice_date,
    KONSTRUCTOR_FIELD.op_contract_date,
] as const;

const makeField = (
    code: string,
    type: string,
    items: FakeFieldItem[] = [],
): FakeField => ({ code, type, bitrixId: code.toUpperCase(), items });

export interface DocumentFieldsOptions {
    /** Коды полей, которых на портале нет. */
    missing?: readonly string[];
    /** Тип поля «Сумма предложения»: `money` — значение `сумма|RUB`. */
    offerSumType?: string;
    /** false — у перечислений нет вариантов (не установлены на портале). */
    enumItems?: boolean;
}

/**
 * Все поля, которые поток документов может записать. Поле «Менеджер по
 * продажам» (`manager_op`) тоже установлено: поток обязан его не трогать.
 */
export const makeDocumentFields = (
    options: DocumentFieldsOptions = {},
): FakeFieldMap => {
    const withItems = options.enumItems ?? true;
    const all: FakeField[] = [
        ...DOCUMENT_COUNTER_CODES.map(code => makeField(code, 'integer')),
        ...DOCUMENT_DATE_CODES.map(code => makeField(code, 'datetime')),
        makeField(EVENT_FIELD.op_current_status, 'string'),
        makeField(
            EVENT_FIELD.op_work_status,
            'enumeration',
            withItems
                ? [{ code: 'work', bitrixId: WORK_STATUS_ITEM_BITRIX_ID }]
                : [],
        ),
        makeField(
            EVENT_FIELD.op_prospects_type,
            'enumeration',
            withItems
                ? [
                      {
                          code: 'op_prospects_good',
                          bitrixId: PROSPECTS_GOOD_ITEM_BITRIX_ID,
                      },
                  ]
                : [],
        ),
        makeField(EVENT_FIELD.offer_sum, options.offerSumType ?? 'money'),
        makeField(EVENT_FIELD.manager_op, 'employee'),
    ];
    return Object.fromEntries(
        all
            .filter(field => !options.missing?.includes(field.code))
            .map((field): [string, FakeField] => [field.code, field]),
    );
};
