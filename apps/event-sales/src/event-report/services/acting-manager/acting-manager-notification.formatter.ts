import {
    eventDonePhrase,
    eventFailPhrase,
    eventMovedPhrase,
    eventPlanPhrase,
} from '../../types/event-report.event-codes';
import {
    ActingManagerMark,
    actingManagerName,
    userProfileUrl,
} from './acting-manager.mark';

/** Карточка клиента, на которую ведёт уведомление. */
export interface INotificationCard {
    /** Раздел url: `company` / `deal` / `lead`. */
    section: string;
    id: number;
    title: string;
}

/** Чем закончилась работа; null — работа продолжается. */
export type NotificationOutcome = 'success' | 'fail' | 'notCa';

/** Плоские данные уведомления — без контекста и без Битрикса. */
export interface IActingManagerNotificationSource {
    domain: string;
    manager: ActingManagerMark;
    /** Тип события отчёта; null — отчитывались не по делу (чистый план). */
    reportEventType: string | null;
    reportEventName: string;
    /** Разговор состоялся. */
    isResult: boolean;
    /** Тип следующего шага; null — шага нет. */
    planEventType: string | null;
    /** Срок следующего шага словами; null — срока нет. */
    planAt: string | null;
    /** Перенос: событие то же, уехало на другой срок. */
    isExpired: boolean;
    outcome: NotificationOutcome | null;
    card: INotificationCard | null;
}

const OUTCOME_TITLE: Record<NotificationOutcome, string> = {
    success: 'Продажа',
    fail: 'Отказ',
    notCa: 'Отказ — не целевой клиент',
};

const url = (href: string, text: string): string =>
    `[URL=${href}]${text}[/URL]`;

/** «Презентация проведена «Разбор договора»»; '' — отчёта по делу не было. */
const doneSentence = (src: IActingManagerNotificationSource): string => {
    if (!src.reportEventType) return '';
    const phrase = src.isResult
        ? eventDonePhrase(src.reportEventType)
        : eventFailPhrase(src.reportEventType);
    const name = src.reportEventName?.trim() ?? '';
    return name ? `${phrase} «${name}»` : phrase;
};

/** «Запланирован Звонок на 23 сентября 16:20»; '' — шага нет. */
const nextSentence = (src: IActingManagerNotificationSource): string => {
    const type =
        src.planEventType ?? (src.isExpired ? src.reportEventType : null);
    if (!type) return '';
    const phrase = src.isExpired
        ? eventMovedPhrase(type)
        : eventPlanPhrase(type);
    return src.planAt ? `${phrase} на ${src.planAt}` : phrase;
};

/**
 * УВЕДОМЛЕНИЕ СОТРУДНИКУ: руководитель отработал его дело.
 *
 * Только уведомление — ни задач, ни комментариев (решение владельца
 * 28.09.2026). Разметка BB-кодом: уведомления портала понимают `[URL=]`.
 * Строки без данных не печатаются.
 *
 *   Руководитель [URL=…]Иванов Иван[/URL] отчитался по вашему делу.
 *   Клиент: [URL=…]ООО «Ромашка»[/URL]
 *   Что сделано: Презентация проведена «Разбор договора»
 *   Итог работы: Продажа
 *   Следующий шаг: Запланирован Звонок на 23 сентября 16:20
 */
export const buildActingManagerNotification = (
    src: IActingManagerNotificationSource,
): string => {
    const who = src.manager.isConfirmedHead ? 'Руководитель' : 'Сотрудник';
    const lines: string[] = [
        `${who} ${url(
            userProfileUrl(src.domain, src.manager.id),
            actingManagerName(src.manager),
        )} отчитался по вашему делу.`,
    ];

    if (src.card?.id) {
        lines.push(
            `Клиент: ${url(
                `https://${src.domain}/crm/${src.card.section}/details/${src.card.id}/`,
                src.card.title,
            )}`,
        );
    }

    const done = doneSentence(src);
    if (done) lines.push(`Что сделано: ${done}`);

    if (src.outcome) lines.push(`Итог работы: ${OUTCOME_TITLE[src.outcome]}`);

    const next = nextSentence(src);
    if (next) lines.push(`Следующий шаг: ${next}`);

    return lines.join('\n');
};
