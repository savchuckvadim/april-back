/**
 * Чистые утилиты ss-restore: даты и матчинг кандидатов.
 *
 * Все даты сравниваются в «портальном локальном» времени строковым разбором —
 * без таймзонной математики: и `ork_event_date` элементов («dd.MM.yyyy
 * HH:mm:ss»), и ISO задач Bitrix несут время портала, поэтому смещение
 * игнорируем и сравниваем компоненты как есть.
 */

/** Тэг восстановленных элементов (поле «Тэг» + смысловая метка периода). */
export const SS_RESTORE_TAG = 'restored-ss-2026-08';

/** Окно матчинга «Состоялся» к дате закрытия задачи: ±2 дня. */
export const DONE_MATCH_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;

/** ISO Bitrix ('2026-05-04T11:50:08+03:00') -> мс в портальном времени. */
export const isoToPortalMs = (iso: string): number | null => {
    const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(
        iso ?? '',
    );
    if (!m) return null;
    return Date.UTC(
        Number(m[1]),
        Number(m[2]) - 1,
        Number(m[3]),
        Number(m[4]),
        Number(m[5]),
        Number(m[6] ?? 0),
    );
};

/** 'dd.MM.yyyy HH:mm:ss' (ork_event_date) -> мс в портальном времени. */
export const crmDateToPortalMs = (value: string): number | null => {
    const m =
        /^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(
            value ?? '',
        );
    if (!m) return null;
    return Date.UTC(
        Number(m[3]),
        Number(m[2]) - 1,
        Number(m[1]),
        Number(m[4] ?? 0),
        Number(m[5] ?? 0),
        Number(m[6] ?? 0),
    );
};

/** ISO Bitrix -> 'dd.MM.yyyy HH:mm:ss' (формат ork_event_date). */
export const isoToCrmDateTime = (iso: string): string => {
    const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(
        iso ?? '',
    );
    if (!m) return '';
    return `${m[3]}.${m[2]}.${m[1]} ${m[4]}:${m[5]}:${m[6] ?? '00'}`;
};

/** CRM-привязки задачи -> идентификаторы сущностей. */
export const extractCrmIds = (
    ufCrmTask: string[] | undefined,
): {
    companyId: number | null;
    dealId: number | null;
    contactId: number | null;
} => {
    let companyId: number | null = null;
    let dealId: number | null = null;
    let contactId: number | null = null;
    for (const link of ufCrmTask ?? []) {
        const value = String(link);
        if (value.startsWith('CO_'))
            companyId ??= Number(value.slice(3)) || null;
        else if (value.startsWith('D_'))
            dealId ??= Number(value.slice(2)) || null;
        else if (value.startsWith('C_'))
            contactId ??= Number(value.slice(2)) || null;
    }
    return { companyId, dealId, contactId };
};

/** Поле «Компания» — строго CO_-привязки (см. calling-flow.companyLinks). */
export const companyOnlyLinks = (
    ufCrmTask: string[] | undefined,
    companyId: number | null,
): string[] => {
    const links = (ufCrmTask ?? []).filter(link =>
        String(link).startsWith('CO_'),
    );
    if (links.length) return links;
    return companyId ? [`CO_${companyId}`] : [];
};

/** Есть ли «Состоялся»-строка в окне ±2 дня от закрытия задачи. */
export const hasDoneInWindow = (
    taskClosedIso: string,
    doneDatesCrm: string[],
): boolean => {
    const closedMs = isoToPortalMs(taskClosedIso);
    if (closedMs === null) return false;
    return doneDatesCrm.some(value => {
        const doneMs = crmDateToPortalMs(value);
        return (
            doneMs !== null &&
            Math.abs(doneMs - closedMs) <= DONE_MATCH_WINDOW_MS
        );
    });
};
