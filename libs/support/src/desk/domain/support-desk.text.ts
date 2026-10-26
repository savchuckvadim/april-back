import {
    escapeHtml,
    supportDialogUrl,
} from '../../monitor/domain/support-signal.formatter';

/** Лимит ответа клиенту: длиннее — это уже статья, а не ответ. */
export const SUPPORT_REPLY_MAX_LENGTH = 4000;

/**
 * Копия ушедшего ответа в Telegram-чат поддержки: команда видит, что и
 * кто подтвердил (план: «каждая отправка пишется в журнал»).
 */
export function formatReplyJournal(input: {
    lineDomain: string;
    chatId: number;
    text: string;
    confirmedBy: string;
    clientName: string | null;
}): string {
    const url = supportDialogUrl(input.lineDomain, input.chatId);
    return [
        `✉️ <b>Ответ клиенту отправлен</b>`,
        `Клиент: ${escapeHtml(input.clientName ?? `чат №${input.chatId}`)}`,
        `Подтвердил: ${escapeHtml(input.confirmedBy)}`,
        `«${escapeHtml(input.text)}»`,
        `<a href="${escapeHtml(url)}">Открыть диалог</a>`,
    ].join('\n');
}

/** Описание задачи на исправление: текст + ссылка на диалог клиента. */
export function buildSupportTaskDescription(input: {
    description: string;
    lineDomain: string;
    chatId?: number;
}): string {
    const lines = [input.description.trim()];
    if (input.chatId) {
        lines.push(
            '',
            `Диалог с клиентом: ${supportDialogUrl(input.lineDomain, input.chatId)}`,
        );
    }
    return lines.join('\n');
}

/** Ссылка на задачу портала. */
export function supportTaskUrl(domain: string, taskId: number): string {
    return `https://${domain}/company/personal/user/0/tasks/task/view/${taskId}/`;
}
