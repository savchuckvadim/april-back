import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';

/**
 * Поля-ссылки сделки: «код → Portal → bitrixId», а при отсутствии кода в
 * слепке — канон install (те же ключи, которыми event-report читает связи в
 * `DEAL_LIST_SELECT`). Без фолбэка старый портал со слепком до появления
 * кода потерял бы связи молча.
 */

/** Ссылки «сделка → сделка» воронок продаж/ТМЦ. */
export const DEAL_TO_DEAL_LINK_CODES = [
    'to_base_sales',
    'to_xo_sales',
    'to_presentation_sales',
    'to_base_tmc',
] as const;

export type DealToDealLinkCode = (typeof DEAL_TO_DEAL_LINK_CODES)[number];

const DEAL_LINK_FALLBACK_KEY: Record<DealToDealLinkCode, string> = {
    to_base_sales: 'UF_CRM_TO_BASE_SALES',
    to_xo_sales: 'UF_CRM_TO_XO_SALES',
    to_presentation_sales: 'UF_CRM_TO_PRESENTATION_SALES',
    to_base_tmc: 'UF_CRM_TO_BASE_TMC',
};

/**
 * Ссылки «сделка → лид» (тот же набор, что в pbx-duplicate и event-report):
 * без фолбэка — поле не в слепке значит не установлено.
 */
export const DEAL_TO_LEAD_LINK_CODES = [
    'deal_from_lead_id',
    'deal_joined_leads',
    'op_smart_lid',
    'op_smart_lids',
] as const;

/** UF-ключ поля-ссылки сделка → сделка. */
export const dealLinkKey = (
    portal: PortalModel,
    code: DealToDealLinkCode,
): string => {
    const field = portal.getEntityFieldByCode('deal', code);
    return field?.bitrixId
        ? `UF_CRM_${field.bitrixId}`
        : DEAL_LINK_FALLBACK_KEY[code];
};

/** UF-ключ поля-ссылки сделка → лид; null — не установлено. */
export const dealLeadLinkKey = (
    portal: PortalModel,
    code: (typeof DEAL_TO_LEAD_LINK_CODES)[number],
): string | null => {
    const field = portal.getEntityFieldByCode('deal', code);
    return field?.bitrixId ? `UF_CRM_${field.bitrixId}` : null;
};

/** UF-ключи установленных ссылок сделка → лид (для select). */
export const dealLeadLinkKeys = (portal: PortalModel): string[] =>
    DEAL_TO_LEAD_LINK_CODES.map(code => dealLeadLinkKey(portal, code)).filter(
        (key): key is string => key !== null,
    );

/**
 * Лиды сделки: штатный `LEAD_ID` + поля-ссылки по слепку, без дублей.
 * Сделки нет — пусто. Строка должна быть прочитана с {@link dealLeadLinkKeys}.
 */
export const dealLeadIds = (
    portal: PortalModel,
    deal: object | null,
): number[] => {
    if (!deal) return [];
    const raw = deal as Record<string, unknown>;
    const ids = new Set(toLinkedIds(raw['LEAD_ID'], /^L_/i));
    for (const key of dealLeadLinkKeys(portal)) {
        for (const id of toLinkedIds(raw[key], /^L_/i)) ids.add(id);
    }
    return [...ids];
};

/** `D_123` / `123` / 123 / ['D_123'] → 123; пусто и мусор → null. */
export const toLinkedDealId = (raw: unknown): number | null =>
    toLinkedId(raw, /^D_/i);

/** `L_12` / `12` / 12 / ['L_12'] → 12; пусто и мусор → null. */
export const toLinkedLeadId = (raw: unknown): number | null =>
    toLinkedId(raw, /^L_/i);

/** Все id из значения (массив или скаляр) с указанным префиксом. */
export const toLinkedIds = (raw: unknown, prefix: RegExp): number[] => {
    const values = Array.isArray(raw) ? raw : [raw];
    const ids = new Set<number>();
    for (const value of values) {
        const id = toLinkedId(value, prefix);
        if (id) ids.add(id);
    }
    return [...ids];
};

const toLinkedId = (raw: unknown, prefix: RegExp): number | null => {
    const value: unknown = Array.isArray(raw) ? (raw as unknown[])[0] : raw;
    // Ссылка — строка или число; объект/мусор даёт пустоту, а не «[object Object]».
    const text =
        typeof value === 'string' || typeof value === 'number'
            ? String(value).trim()
            : '';
    if (!text) return null;
    const id = Number(prefix.test(text) ? text.replace(prefix, '') : text);
    return Number.isFinite(id) && id > 0 ? id : null;
};
