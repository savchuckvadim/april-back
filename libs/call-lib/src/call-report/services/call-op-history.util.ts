/**
 * Короткая история работы прямо в карточке сущности (уточнение владельца
 * 08.09.2026): поля «ОП Текущая история работы» (`op_history`, строка) и
 * «ОП История (Комментарии)» (`op_mhistory`, множественное) есть и у лида,
 * и у компании, и у сделки.
 *
 * Это ДЕШЁВЫЙ КОНТЕКСТ и перекрёстная проверка: последние шаги по клиенту
 * приезжают тем же чтением карточки, которое и так делается. ИСТОЧНИКОМ
 * ИСТИНЫ для семьи сущностей остаётся элемент списка с crm-полем
 * (`CallReportListTruthService`).
 */

import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';

/**
 * Разделитель записей в поле `op_history`: поле НЕ множественное,
 * приложение дописывает очередную запись в конец одной строки через этот
 * символ (тот же разбор в финансовом отчёте, hot-clients-calc).
 */
export const OP_HISTORY_SEPARATOR = '|';

/** Сколько последних записей истории имеет смысл показывать. */
export const OP_HISTORY_TAIL = 6;

/**
 * Записи истории из значения поля: строка со склейкой через `|`,
 * множественное поле массивом или объект-словарь Битрикса. Свежие записи
 * дописываются в конец — возвращается ХВОСТ.
 */
export function callOpHistoryEntries(
    raw: unknown,
    limit: number = OP_HISTORY_TAIL,
): string[] {
    return flatten(raw)
        .flatMap(value => value.split(OP_HISTORY_SEPARATOR))
        .map(value => value.trim())
        .filter(value => value.length > 0)
        .slice(-limit);
}

/**
 * Записи истории из СТРОКИ СУЩНОСТИ (лид/компания/сделка) по слепку
 * портала: оба поля сразу, без magic strings (коды — из
 * `PBX_SALES_EVENT_FIELD_CODES`). Поля нет на портале — пустой список.
 */
export function callOpHistoryOfEntity(
    portal: PortalModel,
    entityType: 'deal' | 'lead' | 'company',
    row: Record<string, unknown>,
    limit: number = OP_HISTORY_TAIL,
): string[] {
    const raw = [
        PBX_SALES_EVENT_FIELD_CODES.op_history,
        PBX_SALES_EVENT_FIELD_CODES.op_mhistory,
    ].map(code => entityFieldRaw(portal, entityType, row, code));
    return callOpHistoryEntries(raw, limit);
}

function entityFieldRaw(
    portal: PortalModel,
    entityType: 'deal' | 'lead' | 'company',
    row: Record<string, unknown>,
    fieldCode: string,
): unknown {
    try {
        const field = portal.getEntityFieldByCode(entityType, fieldCode);
        return field ? row[portal.getFieldBitrixId(field)] : undefined;
    } catch {
        // Слепок портала без этой сущности — истории просто нет.
        return undefined;
    }
}

function flatten(raw: unknown): string[] {
    if (raw == null) return [];
    if (Array.isArray(raw)) return raw.flatMap(entry => flatten(entry));
    if (typeof raw === 'object') return flatten(Object.values(raw));
    if (
        typeof raw !== 'string' &&
        typeof raw !== 'number' &&
        typeof raw !== 'boolean'
    ) {
        return [];
    }
    return [String(raw)];
}
