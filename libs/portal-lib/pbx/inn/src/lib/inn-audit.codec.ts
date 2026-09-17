import {
    timelineBold,
    timelineText,
    toTimelineCommentDirect,
} from '@lib/bitrix/consts/timeline.consts';
import {
    IInnAuditEvent,
    INN_AUDIT_ACTIONS,
    InnAuditAction,
} from '../type/inn.type';

/**
 * АУДИТ ВЫБОРА ИНН ЖИВЁТ В ТАЙМЛАЙНЕ СДЕЛКИ.
 *
 * Решение владельца 17.09.2026: отдельной таблицы-журнала не заводим —
 * миграции в `online` не наши, а истину и так читают роботы Битрикса и
 * печатные формы. Поэтому таймлайн здесь не только «для человека»: из этих
 * же записей складывается состояние, которого нет в полях, —
 * происхождение текущего ИНН («выбрал Иванов» против «поставила
 * автоматика») и скрытые варианты («это не наш ИНН»).
 *
 * Отсюда требование к формату: он должен читаться и человеком, и кодом.
 * Заголовок — фиксированная строка (по ней узнаём действие), значение — в
 * строке `ИНН: …`, автор — в скобках `(#12)`.
 */

/** Общий префикс всех наших записей — по нему отбираются комментарии. */
export const INN_AUDIT_MARKER = 'ИНН сделки:';

/** Заголовок записи по действию. */
const TITLES: Record<InnAuditAction, string> = {
    [INN_AUDIT_ACTIONS.choose]: `${INN_AUDIT_MARKER} выбран вручную`,
    [INN_AUDIT_ACTIONS.auto]: `${INN_AUDIT_MARKER} проставлен автоматически`,
    [INN_AUDIT_ACTIONS.hide]: `${INN_AUDIT_MARKER} вариант скрыт`,
    [INN_AUDIT_ACTIONS.restore]: `${INN_AUDIT_MARKER} вариант возвращён`,
};

const ACTIONS_BY_TITLE = new Map<string, InnAuditAction>(
    Object.entries(TITLES).map(([action, title]) => [
        title,
        action as InnAuditAction,
    ]),
);

export interface IInnAuditRecord {
    action: InnAuditAction;
    inn: string;
    /** Что стояло раньше — только для `choose`, чтобы было видно подмену. */
    previousInn?: string;
    /** Подпись источника («из реквизита компании») — для `auto`. */
    sourceLabel?: string;
    userId?: number | null;
    userName?: string;
}

/** Запись аудита → готовый `COMMENT` для `crm.timeline.comment.add`. */
export function formatInnAuditComment(record: IInnAuditRecord): string {
    const lines: string[] = [timelineBold(TITLES[record.action])];
    lines.push(timelineText(`ИНН: ${record.inn}`));
    if (record.previousInn && record.previousInn !== record.inn) {
        lines.push(timelineText(`Было: ${record.previousInn}`));
    }
    if (record.sourceLabel) {
        lines.push(timelineText(`Источник: ${record.sourceLabel}`));
    }
    lines.push(timelineText(`Кто: ${formatAuthor(record)}`));
    return toTimelineCommentDirect(lines);
}

/** «Иванов Иван (#12)» либо «автоматика», если человека нет. */
function formatAuthor(record: IInnAuditRecord): string {
    const name = record.userName?.trim();
    const id = record.userId ?? null;
    if (!name && !id) return 'автоматика';
    return `${name || 'сотрудник'}${id ? ` (#${id})` : ''}`;
}

/** Одна строка комментария таймлайна, как её отдаёт Битрикс. */
export interface IInnAuditComment {
    comment: string;
    created: string;
}

/**
 * Комментарий таймлайна → событие аудита. Не наша запись → null.
 *
 * Разбор терпимый к разметке: Битрикс возвращает то, что мы записали, но
 * менеджер мог отредактировать комментарий руками.
 */
export function parseInnAuditComment(
    row: IInnAuditComment,
): IInnAuditEvent | null {
    const text = String(row.comment ?? '').replace(/<[^>]*>/g, '');
    if (!text.includes(INN_AUDIT_MARKER)) return null;

    const action = findAction(text);
    if (!action) return null;

    const inn = /ИНН:\s*(\d{10}|\d{12})/.exec(text)?.[1] ?? '';
    if (!inn) return null;

    const author = /Кто:\s*(.+)/.exec(text)?.[1]?.trim() ?? '';
    const userId = Number(/\(#(\d+)\)/.exec(author)?.[1] ?? 0) || null;
    const userName = author.replace(/\s*\(#\d+\)\s*$/, '').trim();

    return {
        action,
        inn,
        userId,
        userName: userName === 'автоматика' ? '' : userName,
        at: String(row.created ?? ''),
    };
}

function findAction(text: string): InnAuditAction | null {
    for (const [title, action] of ACTIONS_BY_TITLE) {
        if (text.includes(title)) return action;
    }
    return null;
}

/**
 * Свёртка истории: по каждому ИНН побеждает ПОСЛЕДНЕЕ событие.
 *
 * События приходят в порядке возрастания времени. Скрытый вариант, который
 * потом выбрали, перестаёт быть скрытым — иначе он исчез бы из карточки
 * вместе с выбранным значением.
 */
export function foldInnAudit(events: readonly IInnAuditEvent[]): {
    hidden: string[];
    lastByInn: Map<string, IInnAuditEvent>;
} {
    const hidden = new Set<string>();
    const lastByInn = new Map<string, IInnAuditEvent>();

    for (const event of events) {
        if (event.action === INN_AUDIT_ACTIONS.hide) {
            hidden.add(event.inn);
        } else {
            hidden.delete(event.inn);
        }
        if (
            event.action === INN_AUDIT_ACTIONS.choose ||
            event.action === INN_AUDIT_ACTIONS.auto
        ) {
            lastByInn.set(event.inn, event);
        }
    }

    return { hidden: [...hidden], lastByInn };
}
