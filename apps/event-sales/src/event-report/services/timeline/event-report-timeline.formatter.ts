import {
    crmCardUrl,
    timelineBold,
    timelineLink,
    timelineText,
} from '@lib/bitrix/consts/timeline.consts';
import {
    eventDonePhrase,
    eventFailPhrase,
    eventMovedPhrase,
    eventPlanPhrase,
    eventTypeName,
} from '../../types/event-report.event-codes';

/** Контакт события: id + готовая подпись ссылки. */
export interface ITimelineContact {
    id: number;
    name: string;
}

/** Карточка, на которую ведёт ссылка «куда смотреть» внизу записи. */
export interface ITimelineCard {
    /** Раздел url: `deal` / `company` / `lead`. */
    section: string;
    /** Подпись строки: «Сделка», «Компания», «Заявка». */
    label: string;
    id: number;
    title: string;
}

/** Чем закончилась работа с клиентом; null — работа продолжается. */
export type TimelineOutcome = 'success' | 'fail' | 'notCa';

/**
 * Всё, из чего складывается запись таймлайна одного отчёта. Плоские данные
 * без контекста и без Bitrix — форматтер тестируется без портала, а сборкой
 * занимается {@link EventReportTimelineService}.
 */
export interface IEventReportTimelineSource {
    domain: string;
    /** Когда событие произошло — «15 сентября 2026». */
    happenedAt: string;
    /** Тип события ОТЧЁТА; null — отчёта по событию нет (чистый план). */
    reportEventType: string | null;
    /** Название события отчёта, которое ввёл менеджер. */
    reportEventName: string;
    /** Событие состоялось (результативный отчёт). */
    isResult: boolean;
    /** Контакт, с которым говорили. */
    reportContact: ITimelineContact | null;
    /** Тип события ПЛАНА; null — следующий шаг не назначен. */
    planEventType: string | null;
    planEventName: string;
    /** Срок следующего шага — «23 сентября 2026, 16:20»; null — срока нет. */
    planAt: string | null;
    /** ПЕРЕНОС: событие то же, просто уехало на другой срок. */
    isExpired: boolean;
    /** Контакт, на который назначен следующий шаг. */
    planContact: ITimelineContact | null;
    /** Презентация проведена ВНЕ плана (спонтанная). */
    isUnplannedPresentation: boolean;
    /** Комментарий менеджера из отчёта. */
    comment: string;
    /** Итог работы; null — работа продолжается. */
    outcome: TimelineOutcome | null;
    /** Карточки клиента: основная сделка, компания, заявка. */
    cards: readonly ITimelineCard[];
}

const OUTCOME_TITLE: Record<TimelineOutcome, string> = {
    success: 'Продажа',
    fail: 'Отказ',
    notCa: 'Отказ — не целевой клиент',
};

/**
 * ЗАПИСЬ ТАЙМЛАЙНА ОСНОВНОГО ПОТОКА ОТЧЁТА — то, что менеджер и руководитель
 * видят в карточке клиента после каждой отправки.
 *
 * Формат (строки без данных не рендерятся вовсе):
 *
 *   <b>15 сентября 2026</b>
 *   Презентация проведена: Разбор договора
 *   Контакт: <a …>Иванов Иван</a>
 *   Следующий шаг: Запланирован Звонок по решению на 23 сентября 2026, 16:20
 *   Контакт: <a …>Петров Пётр</a>
 *   Дополнительно: проведена спонтанная презентация
 *   Итог работы: Продажа
 *   Комментарий: договорились созвониться после совета директоров
 *   Сделка: <a …>ООО «Ромашка» — СПС</a>
 *   Компания: <a …>ООО «Ромашка»</a>
 *   Заявка: <a …>Заявка с сайта</a>
 *
 * Правила, из-за которых формат именно такой:
 *  - РАЗМЕТКА HTML, не BB-код: `[URL=…]` таймлайн карточки показывает сырым
 *    текстом (см. `@lib/bitrix/consts/timeline.consts`);
 *  - ДВА КОНТАКТА РАЗНЫЕ: верхний — тот, с кем говорили (контакт отчёта),
 *    нижний — тот, на кого назначен следующий шаг (контакт плана). Один и
 *    тот же человек в обеих ролях печатается ОДИН раз: повтор ссылки —
 *    шум, а не информация (так же делал легаси-хук);
 *  - ПЕРЕНОС ≠ ПЛАН: при переносе событие не выбирают заново, поэтому
 *    строка читается «Перенесён Звонок на …», а не «Запланирован»;
 *  - переносы строк — обычные `\n`: к batch-проводу запись готовит
 *    транспорт (`toTimelineComment`), и экранировать дважды нельзя.
 */
export const buildEventReportTimelineComment = (
    src: IEventReportTimelineSource,
): string => {
    const lines: string[] = [timelineBold(src.happenedAt)];

    const done = doneLine(src);
    if (done) lines.push(timelineText(done));

    const reportContact = contactLine(src.domain, src.reportContact);
    if (reportContact) lines.push(reportContact);

    const next = nextStepLine(src);
    if (next) lines.push(timelineText(next));

    // Контакт плана — только когда он ДРУГОЙ: тот же человек уже назван выше.
    if (
        next &&
        src.planContact &&
        src.planContact.id !== src.reportContact?.id
    ) {
        const planContact = contactLine(src.domain, src.planContact);
        if (planContact) lines.push(planContact);
    }

    if (src.isUnplannedPresentation) {
        lines.push('Дополнительно: проведена спонтанная презентация');
    }

    if (src.outcome) {
        lines.push(`Итог работы: ${OUTCOME_TITLE[src.outcome]}`);
    }

    const comment = src.comment?.trim() ?? '';
    if (comment) lines.push(`Комментарий: ${timelineText(comment)}`);

    for (const card of src.cards) {
        lines.push(
            `${timelineText(card.label)}: ${timelineLink(
                crmCardUrl(src.domain, card.section, card.id),
                card.title,
            )}`,
        );
    }

    return lines.join('\n');
};

/** «Презентация проведена: Разбор договора»; '' — события отчёта не было. */
const doneLine = (src: IEventReportTimelineSource): string => {
    if (!src.reportEventType) return '';
    const phrase = src.isResult
        ? eventDonePhrase(src.reportEventType)
        : eventFailPhrase(src.reportEventType);
    const name = distinctEventName(src.reportEventName, src.reportEventType);
    return name ? `${phrase}: ${name}` : phrase;
};

/** «Следующий шаг: Запланирован Звонок … на …»; '' — шага нет. */
const nextStepLine = (src: IEventReportTimelineSource): string => {
    // При переносе тип плана менеджер не выбирает заново — событие остаётся
    // тем же, и берётся оно с отчёта.
    const type =
        src.planEventType ?? (src.isExpired ? src.reportEventType : null);
    if (!type) return '';
    const phrase = src.isExpired
        ? eventMovedPhrase(type)
        : eventPlanPhrase(type);
    const name = distinctEventName(src.planEventName, type);
    const when = src.planAt ? ` на ${src.planAt}` : '';
    return `Следующий шаг: ${phrase}${when}${name ? ` — ${name}` : ''}`;
};

/**
 * Название события, если оно добавляет смысл. Менеджер часто называет
 * событие ровно типом («Презентация»), и строка «Презентация проведена:
 * Презентация» выглядит сбоем, а не записью.
 */
const distinctEventName = (name: string, type: string): string => {
    const trimmed = name?.trim() ?? '';
    if (!trimmed) return '';
    return trimmed.toLowerCase() === eventTypeName(type).toLowerCase()
        ? ''
        : trimmed;
};

/** «Контакт: <ссылка>»; '' — контакта нет или он без имени и без id. */
const contactLine = (
    domain: string,
    contact: ITimelineContact | null,
): string => {
    if (!contact || !contact.id) return '';
    return `Контакт: ${timelineLink(
        crmCardUrl(domain, 'contact', contact.id),
        contact.name || `контакт #${contact.id}`,
    )}`;
};
