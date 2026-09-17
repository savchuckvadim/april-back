import { bxFieldText } from '@lib/shared/lib/utils';

export type Row = Record<string, unknown>;

/** Минимум, который нужен от инстанса Битрикса (структурная типизация). */
export interface ILeadClientBitrix {
    api: { call: (method: string, params: Row) => Promise<unknown> };
}

/** Кем становится голый лид. */
export const LEAD_CLIENT_KINDS = ['contact', 'company'] as const;
export type LeadClientKind = (typeof LEAD_CLIENT_KINDS)[number];

/** Клиент, созданный (или найденный созданным ранее) из голого лида. */
export interface ILeadClientRef {
    leadId: number;
    type: LeadClientKind;
    id: number;
    /** Нашёлся созданный прошлым прогоном — второй не создавали. */
    reused: boolean;
}

export interface ILeadClientLinkOptions {
    /** Кого создавать из лида, если `resolveKind` не задан. */
    kind: LeadClientKind;
    /** Решение по каждому лиду отдельно (отдел, похож на организацию). */
    resolveKind?: (lead: Row) => Promise<LeadClientKind>;
    /** Сколько последних дел лида привязывать к новым связям. */
    activitiesLimit: number;
}

export interface ILeadClientLinkResult {
    created: ILeadClientRef[];
    /** Контакты, которые этим прогоном появились у сделки. */
    dealContactsAdded: number[];
    /** Компания, поставленная сделке, у которой её не было. */
    dealCompanySet: number | null;
    /** Сколько новых привязок дел добавлено. */
    activitiesBound: number;
    warnings: string[];
}

/** Клиент лида после шага «создать, если голый». */
export interface ILeadClientPair {
    contactId: number;
    companyId: number;
    /** Связь лид → клиент появилась в этом прогоне. */
    isNew: boolean;
}

/** Значения множественного поля (PHONE/EMAIL) с типом. */
export function multiItems(
    raw: unknown,
): { VALUE: string; VALUE_TYPE: string }[] {
    if (!Array.isArray(raw)) return [];
    const items: { VALUE: string; VALUE_TYPE: string }[] = [];
    for (const item of raw) {
        if (!item || typeof item !== 'object') continue;
        const value = bxFieldText((item as Row).VALUE);
        if (!value) continue;
        const type = bxFieldText((item as Row).VALUE_TYPE) ?? 'WORK';
        items.push({ VALUE: value, VALUE_TYPE: type });
    }
    return items;
}

/**
 * Ключ сравнения контактных данных: у телефона — последние 10 цифр
 * («8 910…» и «+7 910…» — один номер), у почты — нижний регистр.
 */
export function communicationKey(value: string): string {
    const digits = value.replace(/\D/g, '');
    if (digits.length >= 10 && !value.includes('@')) return digits.slice(-10);
    return value.trim().toLowerCase();
}

/** Ответ `api.call` → `result`. */
export function resultOf(response: unknown): unknown {
    return response && typeof response === 'object'
        ? (response as Row).result
        : undefined;
}
