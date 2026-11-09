import type { IField } from '@lib/portal-lib/portal/interfaces/portal.interface';
import type { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx';
import { PBX_DEAL_SALES_BASE_STAGE_CODE } from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import {
    toPortalDate,
    type OwnerReportClosedDeal,
} from '@lib/sales-ai-analytics';

/**
 * Сигналы отказа и успеха из строки сделки «ОП Основная» для признака
 * «реактивация» — чистые функции без DI (сборка строк — в
 * OwnerReportReactivationLoader).
 *
 * Правила отказа — те же, что у сверки причин отказа в event-sales
 * (refusal-reason.reader.ts): финалы «Отказ» / «Не состоялась» / «Не ЦА»
 * (решение владельца 14.10.2026; «Не беспокоить» — не отказ). Поля сделки —
 * вторичный источник (09.11.2026): «ОП Перспективность Клиента» со
 * значением «Нет перспектив» или «Отказ», заполненная «ОП Причина Отказа»
 * (элемент справочника — уже причина, проверять текст не нужно), «ОП
 * Причины нерезультативности» = «Не интересует, до свидания». Дата
 * сигнала по полям — закрытие сделки, у открытой — последнее изменение.
 */

const REFUSAL_STAGE_CODES: ReadonlySet<string> = new Set([
    PBX_DEAL_SALES_BASE_STAGE_CODE.fail,
    PBX_DEAL_SALES_BASE_STAGE_CODE.apology,
    PBX_DEAL_SALES_BASE_STAGE_CODE.notCa,
]);
const WON_STAGE_CODE: string = PBX_DEAL_SALES_BASE_STAGE_CODE.success;

/**
 * Коды элементов справочников портала (PBX_SALES_EVENT_FIELDS, items):
 * «Нет перспектив», «Отказ» у перспективности и «Не интересует, до
 * свидания» у причин нерезультативности.
 */
const PROSPECTS_REFUSAL_ITEM_CODES = [
    'op_prospects_nopersp',
    'op_prospects_fail',
] as const;
const NORESULT_REFUSAL_ITEM_CODE = 'bay';

/** Поля сделки, по которым виден отказ: UF-ключи и id элементов справочников. */
export interface DealRefusalFields {
    /** Ключи для select в crm.deal.list. */
    select: string[];
    prospectsKey: string | null;
    prospectsRefusalIds: ReadonlySet<string>;
    failReasonKey: string | null;
    noresultKey: string | null;
    noresultRefusalId: string | null;
}

/** Строка сделки из crm.deal.list — стандартные поля и UF по ключам. */
export type DealRow = Record<string, unknown>;

/** Поля отказа по слепку портала; null — ни одно поле не заведено. */
export function refusalFieldsOf(portal: PortalModel): DealRefusalFields | null {
    try {
        const prospects = fieldOf(
            portal,
            PBX_SALES_EVENT_FIELD_CODES.op_prospects_type,
        );
        const failReason = fieldOf(
            portal,
            PBX_SALES_EVENT_FIELD_CODES.op_efield_fail_reason,
        );
        const noresult = fieldOf(
            portal,
            PBX_SALES_EVENT_FIELD_CODES.op_noresult_reason,
        );
        const select = [prospects, failReason, noresult]
            .map(entry => entry?.key ?? null)
            .filter((key): key is string => key !== null);
        if (select.length === 0) return null;
        return {
            select,
            prospectsKey: prospects?.key ?? null,
            prospectsRefusalIds: new Set(
                PROSPECTS_REFUSAL_ITEM_CODES.map(code =>
                    itemIdOf(prospects?.field, code),
                ).filter((id): id is string => id !== null),
            ),
            failReasonKey: failReason?.key ?? null,
            noresultKey: noresult?.key ?? null,
            noresultRefusalId: itemIdOf(
                noresult?.field,
                NORESULT_REFUSAL_ITEM_CODE,
            ),
        };
    } catch {
        return null;
    }
}

function fieldOf(
    portal: PortalModel,
    code: string,
): { field: IField; key: string } | null {
    const field = portal.getDealFieldByCode(code);
    if (!field) return null;
    const key = portal.getFieldBitrixId(field);
    return key ? { field, key } : null;
}

function itemIdOf(field: IField | undefined, code: string): string | null {
    const item = field?.items?.find(entry => entry.code === code);
    return item ? String(item.bitrixId) : null;
}

/** Скаляр или первый элемент массива строкой; пусто → null. */
function scalarOf(value: unknown): string | null {
    const raw = Array.isArray(value) ? (value[0] as unknown) : value;
    if (typeof raw === 'number') return String(raw);
    if (typeof raw === 'string') return raw.trim() || null;
    return null;
}

function dayOf(value: unknown, timeZone: string): string | null {
    if (typeof value !== 'string' || !value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : toPortalDate(date, timeZone);
}

/** Есть ли в полях сделки признак отказа. */
function fieldsSayRefusal(deal: DealRow, fields: DealRefusalFields): boolean {
    const prospects = fields.prospectsKey
        ? scalarOf(deal[fields.prospectsKey])
        : null;
    if (prospects && fields.prospectsRefusalIds.has(prospects)) return true;
    if (fields.failReasonKey && scalarOf(deal[fields.failReasonKey]))
        return true;
    const noresult = fields.noresultKey
        ? scalarOf(deal[fields.noresultKey])
        : null;
    return noresult !== null && noresult === fields.noresultRefusalId;
}

/**
 * Сигналы одной сделки: финал (отказ/успех с датой закрытия) и, если поля
 * заведены, отказ по полям. У успешной сделки поля не читаются — успех
 * важнее пометок.
 */
export function dealSignalsOf(
    deal: DealRow,
    codeOfStage: ReadonlyMap<string, string>,
    fields: DealRefusalFields | null,
    timeZone: string,
): OwnerReportClosedDeal[] {
    const signals: OwnerReportClosedDeal[] = [];
    const code = codeOfStage.get(scalarOf(deal.STAGE_ID) ?? '');
    const closed = dayOf(deal.CLOSEDATE, timeZone);
    if (code === WON_STAGE_CODE) {
        if (closed)
            signals.push({ kind: 'won', date: closed, source: 'stage' });
        return signals;
    }
    if (code && REFUSAL_STAGE_CODES.has(code) && closed) {
        signals.push({ kind: 'refusal', date: closed, source: 'stage' });
    }
    if (fields && fieldsSayRefusal(deal, fields)) {
        const date = closed ?? dayOf(deal.DATE_MODIFY, timeZone);
        if (date) signals.push({ kind: 'refusal', date, source: 'fields' });
    }
    return signals;
}
