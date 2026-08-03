import { IBXField } from '@lib/bitrix';

/**
 * Эвристика «это поле хранит ИНН».
 *
 * Нужна потому, что на каждом портале ИНН лежит где угодно: у нас есть
 * шаблонное `op_inn` → `UF_CRM_OP_INN`, но клиент мог завести своё
 * `UF_CRM_1750854801` с названием «ИНН контрагента». Такие поля мы находим
 * сканом всех UF-полей и помечаем источником `heuristic` — админ подтверждает
 * или выключает их руками.
 */

/**
 * `ИНН`/`INN`/`TIN` как отдельное слово. Границы обязательны, иначе в выборку
 * попадают «Иннова», «инновации», «beginning», «winner».
 */
const INN_WORD_RE = /(^|[^a-zа-яё0-9])(инн|inn|tin)([^a-zа-яё0-9]|$)/i;

/** Типы UF-полей, в которых ИНН вообще может лежать. */
const INN_FIELD_TYPES = new Set(['string', 'integer', 'double']);

/** Слова, из-за которых поле точно не про ИНН, даже если «инн» внутри есть. */
const NEGATIVE_RE = /(иннова|innovat|beginn|winner|inner)/i;

/** Все человекочитаемые подписи поля — Битрикс отдаёт их картой по языкам. */
function labelsOf(field: IBXField): string[] {
    const fromMap = (map: Record<string, string | null> | undefined) =>
        map ? Object.values(map).filter((v): v is string => !!v) : [];

    return [
        field.LABEL,
        field.FIELD_NAME,
        field.XML_ID ?? '',
        ...fromMap(field.EDIT_FORM_LABEL),
        ...fromMap(field.LIST_COLUMN_LABEL),
        ...fromMap(field.LIST_FILTER_LABEL),
    ].filter(Boolean);
}

/** Похоже ли живое UF-поле Битрикса на хранилище ИНН. */
export function isInnLikeField(field: IBXField): boolean {
    const type = String(field.USER_TYPE_ID ?? '').toLowerCase();
    if (type && !INN_FIELD_TYPES.has(type)) return false;

    const labels = labelsOf(field);
    if (labels.some(label => NEGATIVE_RE.test(label))) return false;

    return labels.some(label => INN_WORD_RE.test(label));
}

/** Похож ли на ИНН код поля из нашего шаблона/PortalDB (`op_inn`, `OP_INN`). */
export function isInnLikeCode(code: string | null | undefined): boolean {
    if (!code) return false;
    if (NEGATIVE_RE.test(code)) return false;
    return INN_WORD_RE.test(code);
}

/** Читаемое название поля для админки: первая непустая подпись. */
export function fieldTitle(field: IBXField): string {
    const labels = labelsOf(field).filter(
        label => label !== field.FIELD_NAME && label !== field.XML_ID,
    );
    return labels[0] ?? field.FIELD_NAME;
}
