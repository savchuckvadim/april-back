import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import { ETimeZone } from '@lib/shared/lib/date';

// Плагины idempotent: extend() повторно — no-op. Без явной регистрации
// util зависел бы от порядка импортов (plugин ставит parse-portal-input).
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

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

/* ------------------------------------------------------------------ *
 * Канонические тексты событий пути заявки. История — источник истины
 * для «назначена → принята» (от разницы считается firstprepare_long),
 * поэтому тексты живут здесь, а не размазаны по сервисам.
 * ------------------------------------------------------------------ */

export const LEAD_REQUEST_HISTORY_TEXT = {
    assigned: (responsibleId: number): string =>
        `ХО назначен: ${responsibleId}`,
    transferred: (fromId: number, toId: number): string =>
        `ХО передан: ${fromId} → ${toId}`,
    /** Сотрудник САМ отдал заявку (кнопка «Передать другому») — подсветка. */
    selfTransferred: (fromId: number, toId: number): string =>
        `⚠ Сотрудник ${fromId} сам передал заявку → ${toId}`,
    accepted: (userId: number | null): string =>
        userId
            ? `Заявка принята в работу: ${userId}`
            : 'Заявка принята в работу',
} as const;

/** Запись — назначение/передача ХО (точка отсчёта firstprepare). */
export function isAssignHistoryEntry(entry: string): boolean {
    return (
        /ХО (назначен|передан)/.test(entry) ||
        entry.includes('сам передал заявку')
    );
}

/** Запись — принятие заявки менеджером. */
export function isAcceptHistoryEntry(entry: string): boolean {
    return entry.includes('Заявка принята в работу');
}

/** «10.08.2026 12:40 — …» → Date в TZ портала; не распарсилось — null. */
export function parseHistoryEntryDate(
    entry: string,
    portalTz: ETimeZone,
): Date | null {
    const match = /^(\d{2}\.\d{2}\.\d{4} \d{2}:\d{2})\s*—/.exec(entry);
    if (!match) return null;
    const parsed = dayjs.tz(match[1], 'DD.MM.YYYY HH:mm', portalTz);
    return parsed.isValid() ? parsed.toDate() : null;
}

/** Состояние принятия по истории заявки. */
export interface LeadRequestAcceptState {
    /** Момент последнего назначения/передачи ХО. */
    lastAssignedAt: Date | null;
    /** Принята ли заявка ПОСЛЕ последнего назначения. */
    acceptedAfterAssign: boolean | null;
}

/**
 * «Принята ли заявка»: ищем последние записи назначения и принятия.
 * Принятие валидно, только если оно ПОЗЖЕ последнего назначения
 * (после передачи другому менеджеру заявку надо принимать заново).
 * Записей нет вовсе → null (истина неизвестна, решает вызывающий).
 */
export function getLeadRequestAcceptState(
    currentRaw: unknown,
    portalTz: ETimeZone,
): LeadRequestAcceptState {
    const entries = (Array.isArray(currentRaw) ? currentRaw : [])
        .map(value => (typeof value === 'string' ? value : ''))
        .filter(Boolean);

    let lastAssignIndex = -1;
    let lastAcceptIndex = -1;
    let lastAssignedAt: Date | null = null;
    entries.forEach((entry, index) => {
        if (isAssignHistoryEntry(entry)) {
            lastAssignIndex = index;
            lastAssignedAt = parseHistoryEntryDate(entry, portalTz);
        }
        if (isAcceptHistoryEntry(entry)) lastAcceptIndex = index;
    });

    if (lastAssignIndex === -1 && lastAcceptIndex === -1) {
        return { lastAssignedAt: null, acceptedAfterAssign: null };
    }
    return {
        lastAssignedAt,
        acceptedAfterAssign: lastAcceptIndex > lastAssignIndex,
    };
}
