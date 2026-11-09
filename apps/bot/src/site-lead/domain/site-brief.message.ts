import { TELEGRAM_MAX_TEXT } from '@lib/telegram';
import { clipEscaped, splitEscaped } from './telegram-html';
import {
    SITE_BRIEF_MAX_PARTS,
    SITE_BRIEF_TITLES,
    type SiteBrief,
} from './site-brief.types';

/** Потолок коротких полей в шапке после экранирования. */
const FIELD_BUDGET = 120;

/** Дописывается к последней части, если протокол длиннее потолка частей. */
const OVERFLOW_NOTE = `\n\n… протокол длиннее ${SITE_BRIEF_MAX_PARTS} сообщений, остаток не отправлен — попросите прислать его файлом.`;

/** Тема: «Бриф калибровки: компания / домен» — по ней части собираются в чате. */
const subjectOf = (brief: SiteBrief): string => {
    const who = [brief.company, brief.domain]
        .filter((value): value is string => Boolean(value))
        .map(value => clipEscaped(value, FIELD_BUDGET))
        .join(' / ');
    return `${SITE_BRIEF_TITLES[brief.kind]}: ${who || 'реквизиты не указаны'}`;
};

const headerOf = (subject: string, counter: string, meta: string): string =>
    `📋 <b>${subject}</b>${counter}${meta}\n\n`;

const counterOf = (index: number, total: number): string =>
    total > 1 ? ` (часть ${index + 1} из ${total})` : '';

/**
 * Протокол брифа → сообщения для чата (HTML). Каждая часть начинается с
 * темы и номера, первая — ещё и с тем, кто заполнил. Бюджет тела считается
 * от самой длинной возможной шапки и приписки о переполнении, поэтому
 * каждая часть гарантированно в лимите Telegram. Сверх потолка частей
 * последняя честно говорит, что остаток не отправлен.
 */
export function formatSiteBriefMessages(brief: SiteBrief): string[] {
    const subject = subjectOf(brief);
    const respondent = brief.respondent
        ? `\nЗаполнил: ${clipEscaped(brief.respondent, FIELD_BUDGET)}`
        : '';
    const widestHeader = headerOf(
        subject,
        counterOf(SITE_BRIEF_MAX_PARTS - 1, SITE_BRIEF_MAX_PARTS),
        respondent,
    );
    const bodyBudget =
        TELEGRAM_MAX_TEXT - widestHeader.length - OVERFLOW_NOTE.length;

    const bodies = splitEscaped(brief.protocol, bodyBudget);
    const parts =
        bodies.length > SITE_BRIEF_MAX_PARTS
            ? [
                  ...bodies.slice(0, SITE_BRIEF_MAX_PARTS - 1),
                  `${bodies[SITE_BRIEF_MAX_PARTS - 1]}${OVERFLOW_NOTE}`,
              ]
            : bodies;

    return parts.map(
        (body, index) =>
            `${headerOf(subject, counterOf(index, parts.length), index === 0 ? respondent : '')}${body}`,
    );
}
