import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { ETimeZone } from '@lib/shared/lib/date';

// Плагины idempotent: extend() повторно — no-op. Без явной регистрации
// util зависел бы от порядка импортов (plugин ставит parse-portal-input).
dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * История обработки заявки — поле лида `op_lead_firstprepare_history`
 * (multiple string). Каждая строка — одно событие: «дата — текст».
 *
 * Правило то же, что у KPI: прошлое не переписываем — только append.
 * Multiple-поле Битрикса при update ПЕРЕЗАПИСЫВАЕТСЯ целиком, поэтому
 * append обязан идти от текущего значения лида (прочитанного в этой же
 * операции), иначе история потеряется.
 */

/** Держим историю компактной: старые записи не удаляем до этого предела. */
export const LEAD_REQUEST_HISTORY_MAX_ENTRIES = 100;

/** «10.08.2026 12:40 — ХО назначен: 447». */
export function buildLeadRequestHistoryEntry(
    text: string,
    portalTz: ETimeZone,
): string {
    const stamp = dayjs().tz(portalTz).format('DD.MM.YYYY HH:mm');
    return `${stamp} — ${text}`;
}

/**
 * Текущее значение multiple-поля + новая запись → значение для update.
 * Повторная запись с тем же текстом подряд не дублируется (двойной клик).
 */
export function appendLeadRequestHistory(
    currentRaw: unknown,
    entry: string,
): string[] {
    const current = (Array.isArray(currentRaw) ? currentRaw : [currentRaw])
        .map(value =>
            typeof value === 'string' || typeof value === 'number'
                ? String(value).trim()
                : '',
        )
        .filter(Boolean);

    const last = current[current.length - 1];
    // Сравниваем без таймштампа: тот же текст подряд = дубль клика.
    if (last && tail(last) === tail(entry)) return current;

    const next = [...current, entry];
    return next.length > LEAD_REQUEST_HISTORY_MAX_ENTRIES
        ? next.slice(next.length - LEAD_REQUEST_HISTORY_MAX_ENTRIES)
        : next;
}

/** Текст записи без ведущего таймштампа. */
function tail(entry: string): string {
    const index = entry.indexOf('—');
    return index >= 0 ? entry.slice(index + 1).trim() : entry.trim();
}
