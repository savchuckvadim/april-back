import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { ETimeZone } from '@lib/shared/lib/date';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx';
import { EnumLeadRequestFieldCode } from '@lib/portal-lib/pbx/pbx-lead-request/type/pbx-lead-request.enum';
import {
    appendLeadRequestHistory,
    buildLeadRequestHistoryEntry,
} from './lead-request-history.util';

// Плагины idempotent: extend() повторно — no-op (см. lead-request-history.util).
dayjs.extend(utc);
dayjs.extend(timezone);

/** Формат CRM datetime-полей Битрикса (локальное время портала). */
const CRM_DATETIME_FORMAT = 'DD.MM.YYYY HH:mm:ss';

type BxRow = Record<string, unknown>;

/**
 * Таймер «работа ждёт подтверждения» НА СДЕЛКЕ — `op_lead_assigned_at`.
 *
 * Зеркало лидового таймера, но живёт своей жизнью и к конвертации заявки
 * отношения не имеет: заполнить его может ЛЮБАЯ сделка. Смысл — «с какого
 * момента работа ждёт подтверждения»; пока поле заполнено, сделку обязаны
 * подтвердить, иначе SLA перераспределит её дела другому сотруднику.
 *
 * Инварианты, ради которых это отдельный модуль:
 *  - ставится в ОДНОМ месте (передача работы) и снимается в ОДНОМ
 *    (принятие) — обойти точку очистки нельзя;
 *  - у лида свой таймер, у сделки свой; они не заменяют друг друга;
 *  - поля нет в слепке портала → всё молча пропускается (graceful).
 */

/** UF-имя поля таймера на сделке; null — поле не установлено на портале. */
export function dealAssignedAtName(portal: PortalModel): string | null {
    const field = portal.getEntityFieldByCode(
        'deal',
        EnumLeadRequestFieldCode.op_lead_assigned_at,
    );
    return field ? portal.getFieldBitrixId(field) : null;
}

/** UF-имя multiple-поля истории сделки; null — поле не установлено. */
export function dealHistoryName(portal: PortalModel): string | null {
    const field = portal.getEntityFieldByCode(
        'deal',
        PBX_SALES_EVENT_FIELD_CODES.op_mhistory,
    );
    return field ? portal.getFieldBitrixId(field) : null;
}

/**
 * СТАРТ ожидания: пишет текущий момент в локали портала.
 * Ставится при каждой передаче — новый ответственный не должен наследовать
 * чужую просрочку.
 */
export function stampDealAssignedAt(
    portal: PortalModel,
    fields: BxRow,
    timezoneName: ETimeZone,
): boolean {
    const name = dealAssignedAtName(portal);
    if (!name) return false;
    fields[name] = dayjs().tz(timezoneName).format(CRM_DATETIME_FORMAT);
    return true;
}

/**
 * СНЯТИЕ ожидания: пустое поле = ждать больше нечего, и SLA-крон сделку
 * не увидит (отбор идёт по заполненности).
 */
export function clearDealAssignedAt(
    portal: PortalModel,
    fields: BxRow,
): boolean {
    const name = dealAssignedAtName(portal);
    if (!name) return false;
    fields[name] = '';
    return true;
}

/**
 * Зеркальная запись в историю СДЕЛКИ (`op_mhistory`).
 *
 * Менеджер живёт в воронке сделок и в лид не заходит — без зеркала путь
 * работы виден только в лиде. `dealRow` обязателен: multiple-поле при
 * update перезаписывается целиком, и запись вслепую стёрла бы прошлую
 * историю сделки. Нет строки — молча не пишем (лучше без записи, чем
 * потерять историю).
 */
export function appendDealHistory(
    portal: PortalModel,
    fields: BxRow,
    dealRow: BxRow | null,
    text: string,
): boolean {
    const name = dealHistoryName(portal);
    if (!name || !dealRow) return false;
    fields[name] = appendLeadRequestHistory(
        dealRow[name],
        buildLeadRequestHistoryEntry(text, portal.getTimezone()),
    );
    return true;
}
