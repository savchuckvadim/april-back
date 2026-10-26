/**
 * Сырой элемент lists.element.get → компактная запись дайджеста.
 *
 * Значения свойств Битрикс отдаёт объектами `{ valueId: value }` (или
 * массивами) — скаляры вынимаются как в SalesListReaderService. Выпадающие
 * списки резолвятся по bitrixId элемента из слепка портала. Даты
 * нормализуются к `YYYY-MM-DD HH:mm:ss` в ЛОКАЛЬНОМ времени портала без
 * пересчёта зон — часы дайджеста должны совпадать с тем, что видит менеджер.
 */
import { KPI_DIGEST_COMMENT_LIMIT } from '../constants/digest.const';
import type { KpiDigestRecordDto } from '../dto/digest-response.dto';
import type {
    DigestListField,
    DigestListFields,
} from './digest-list-fields.util';
import type { ListElementRow } from './digest-page-loader';

/** Сырое значение свойства → скаляры ({id: value}-объекты и массивы — в значения). */
export function scalarsOf(raw: unknown): string[] {
    if (raw == null) return [];
    if (Array.isArray(raw)) return raw.flatMap(entry => scalarsOf(entry));
    if (typeof raw === 'object') return scalarsOf(Object.values(raw));
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

export const firstScalar = (raw: unknown): string | null =>
    scalarsOf(raw)[0] ?? null;

const LEGACY_DT_RE =
    /^(\d{2})\.(\d{2})\.(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/;
const ISO_DT_RE =
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/;

/**
 * `DD.MM.YYYY HH:mm:ss` | `DD.MM.YYYY` | ISO (с зоной или без) →
 * `YYYY-MM-DD HH:mm:ss` (без времени → 00:00:00). Невалидно → null.
 */
export function normalizeBitrixDateTime(
    value: string | null | undefined,
): string | null {
    const text = String(value ?? '').trim();
    if (!text) return null;
    const legacy = LEGACY_DT_RE.exec(text);
    if (legacy) {
        const [, dd, mm, yyyy, hh = '00', mi = '00', ss = '00'] = legacy;
        return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
    }
    const iso = ISO_DT_RE.exec(text);
    if (iso) {
        const [, yyyy, mm, dd, hh = '00', mi = '00', ss = '00'] = iso;
        return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
    }
    return null;
}

/** Значение свойства из элемента по любому из известных ключей поля. */
export function rawOf(
    item: ListElementRow,
    field: DigestListField | undefined,
): unknown {
    if (!field) return undefined;
    for (const key of field.valueKeys) {
        if (item[key] !== undefined) return item[key];
    }
    return undefined;
}

const COMPANY_REF_RE = /^CO_(\d+)$/;

function resolveCompanyId(
    companyRaw: unknown,
    crmRefs: readonly string[],
): number | null {
    const direct = firstScalar(companyRaw);
    if (direct) {
        const digits = Number(direct.replace(/\D/g, ''));
        if (Number.isFinite(digits) && digits > 0) return digits;
    }
    for (const ref of crmRefs) {
        const match = COMPANY_REF_RE.exec(ref);
        if (match) return Number(match[1]);
    }
    return null;
}

export function mapListElementToRecord(
    item: ListElementRow,
    fields: DigestListFields,
    commentLimit: number = KPI_DIGEST_COMMENT_LIMIT,
): KpiDigestRecordDto {
    const typeItem = fields.itemsByValue.eventType.get(
        firstScalar(rawOf(item, fields.eventType)) ?? '',
    );
    const actionItem = fields.itemsByValue.eventAction.get(
        firstScalar(rawOf(item, fields.eventAction)) ?? '',
    );
    const resultItem = fields.itemsByValue.resultStatus.get(
        firstScalar(rawOf(item, fields.resultStatus)) ?? '',
    );
    const reasonItem = fields.itemsByValue.noresultReason.get(
        firstScalar(rawOf(item, fields.noresultReason)) ?? '',
    );

    const eventDate =
        normalizeBitrixDateTime(firstScalar(rawOf(item, fields.eventDate))) ??
        normalizeBitrixDateTime(firstScalar(item.DATE_CREATE));
    const planDate = normalizeBitrixDateTime(
        firstScalar(rawOf(item, fields.planDate)),
    );

    const comment = scalarsOf(rawOf(item, fields.comment)).join(' ').trim();
    const crmRefs = scalarsOf(rawOf(item, fields.crm));
    const rawId = item.ID;

    return {
        id:
            typeof rawId === 'string' || typeof rawId === 'number'
                ? String(rawId)
                : '',
        userId: Number(firstScalar(rawOf(item, fields.responsible))) || 0,
        typeCode: typeItem?.code ?? null,
        typeName: typeItem?.name ?? null,
        actionCode: actionItem?.code ?? null,
        actionName: actionItem?.name ?? null,
        eventDate,
        planDate,
        resultCode: resultItem?.code ?? null,
        noresultReason: reasonItem?.code ?? null,
        comment:
            comment.length > commentLimit
                ? `${comment.slice(0, commentLimit)}…`
                : comment,
        name: typeof item.NAME === 'string' ? item.NAME : '',
        crmRefs,
        companyId: resolveCompanyId(rawOf(item, fields.crmCompany), crmRefs),
    };
}
