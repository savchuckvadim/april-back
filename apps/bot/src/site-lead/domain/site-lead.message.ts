import { TELEGRAM_MAX_TEXT } from '@lib/telegram';
import { isReachableEmail, isReachablePhone } from './site-lead.contact';
import { clipEscaped } from './telegram-html';
import { SITE_LEAD_TITLES, type SiteLead } from './site-lead.types';

/**
 * Потолки полей после экранирования. Экранирование раздувает текст до
 * шести раз («"» → «&quot;»), поэтому шапка ограничена отдельно, а
 * комментарию достаётся остаток до лимита Telegram.
 */
const ESCAPED_BUDGET = {
    name: 300,
    phone: 120,
    email: 300,
    company: 600,
    page: 300,
} as const;

/** Запас на перевод строки и обрамление комментария. */
const COMMENT_MARGIN = 32;

/**
 * Сообщение о заявке для чата заявок (HTML). Пустые необязательные поля не
 * печатаются; длина всегда в пределах лимита Telegram.
 */
export function formatSiteLeadMessage(lead: SiteLead): string {
    const lines = [
        `📩 <b>${SITE_LEAD_TITLES[lead.kind]}</b>`,
        `Страница: ${clipEscaped(lead.page, ESCAPED_BUDGET.page)}`,
    ];
    if (lead.name)
        lines.push(`Имя: ${clipEscaped(lead.name, ESCAPED_BUDGET.name)}`);
    if (lead.phone) {
        const mark = isReachablePhone(lead.phone)
            ? ''
            : ' (меньше 10 цифр — уточнить)';
        lines.push(
            `Телефон: ${clipEscaped(lead.phone, ESCAPED_BUDGET.phone)}${mark}`,
        );
    }
    if (lead.email) {
        const mark = isReachableEmail(lead.email) ? '' : ' (адрес с ошибкой)';
        lines.push(
            `Почта: ${clipEscaped(lead.email, ESCAPED_BUDGET.email)}${mark}`,
        );
    }
    if (lead.company) {
        lines.push(
            `Компания: ${clipEscaped(lead.company, ESCAPED_BUDGET.company)}`,
        );
    }
    const head = lines.join('\n');
    if (!lead.comment) return head;

    const budget = TELEGRAM_MAX_TEXT - head.length - COMMENT_MARGIN;
    return `${head}\n\n<i>${clipEscaped(lead.comment, budget)}</i>`;
}
