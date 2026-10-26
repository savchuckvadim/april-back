import {
    SupportDialog,
    SupportMessage,
    SupportSignal,
    SupportSignalKind,
} from './support-dialog.types';

/** Сколько символов сообщения клиента цитировать в оповещении. */
export const SUPPORT_QUOTE_MAX_LENGTH = 300;

const TITLE_ICON: Record<SupportSignalKind, string> = {
    new_dialog: '🆕',
    waiting: '⏳',
    escalation: '🔴',
};

/** «12 мин», «1 ч 5 мин», «2 ч» — без склонений. */
export function formatWaitDuration(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (!hours) return `${rest} мин`;
    return rest ? `${hours} ч ${rest} мин` : `${hours} ч`;
}

/** Сущности CRM, у которых есть карточка по адресу `/crm/<тип>/details/<id>/`. */
const CRM_CARD_TYPES = ['deal', 'lead', 'contact', 'company'] as const;

/** Карточка CRM, к которой линия привязала диалог; null — нет или не карточка. */
export function supportCrmUrl(
    lineDomain: string,
    binding: { entityType: string; entityId: number } | null,
): string | null {
    if (!binding) return null;
    const type = binding.entityType.toLowerCase();
    if (!(CRM_CARD_TYPES as readonly string[]).includes(type)) return null;
    return `https://${lineDomain}/crm/${type}/details/${binding.entityId}/`;
}

/** Ссылка на диалог открытой линии в мессенджере портала линии. */
export function supportDialogUrl(lineDomain: string, chatId: number): string {
    return `https://${lineDomain}/online/?IM_DIALOG=chat${chatId}`;
}

const titleOf = (signal: SupportSignal): string => {
    const wait = formatWaitDuration(signal.waitedMinutes);
    switch (signal.kind) {
        case 'new_dialog':
            return 'Новый вопрос в поддержке';
        case 'waiting':
            return `Клиент ждёт ответа ${wait}`;
        case 'escalation':
            return `Клиент ждёт ответа уже ${wait}, нужен ответ`;
    }
};

/** Что процитировать: неотвеченное сообщение, иначе последнее клиента. */
const quotedMessage = (signal: SupportSignal): SupportMessage | null => {
    if (signal.pending) return signal.pending;
    const fromClient = signal.dialog.messages.filter(m => m.role === 'client');
    return fromClient[fromClient.length - 1] ?? null;
};

const truncate = (text: string): string =>
    text.length > SUPPORT_QUOTE_MAX_LENGTH
        ? `${text.slice(0, SUPPORT_QUOTE_MAX_LENGTH).trimEnd()}…`
        : text;

const clientLine = (dialog: SupportDialog): string =>
    dialog.client.portal
        ? `Клиент: ${dialog.client.name}, портал ${dialog.client.portal}`
        : `Клиент: ${dialog.client.name}`;

const operatorLine = (dialog: SupportDialog): string => {
    if (!dialog.operatorId) return 'Пока никто не взял';
    return `Оператор: ${dialog.operatorName ?? `сотрудник №${dialog.operatorId}`}`;
};

/** Строки тела без заголовка и ссылки — общие для обоих каналов. */
function bodyLines(signal: SupportSignal): string[] {
    const lines = [clientLine(signal.dialog)];
    const quoted = quotedMessage(signal);
    if (quoted) lines.push(`«${truncate(quoted.text)}»`);
    if (signal.kind === 'new_dialog' && signal.waitedMinutes > 0) {
        lines.push(`Ждёт ответа ${formatWaitDuration(signal.waitedMinutes)}`);
    }
    lines.push(operatorLine(signal.dialog));
    return lines;
}

/** Колокольчик Битрикса: BB-код (im.notify.system.add). */
export function formatSupportBell(
    signal: SupportSignal,
    lineDomain: string,
): string {
    const url = supportDialogUrl(lineDomain, signal.dialog.chatId);
    return [
        `[B]${titleOf(signal)}[/B]`,
        ...bodyLines(signal).map(escapeBbCode),
        `[URL=${url}]Открыть диалог[/URL]`,
    ].join('\n');
}

/** Telegram: HTML-разметка (parse_mode = HTML). */
export function formatSupportTelegram(
    signal: SupportSignal,
    lineDomain: string,
): string {
    const url = supportDialogUrl(lineDomain, signal.dialog.chatId);
    return [
        `${TITLE_ICON[signal.kind]} <b>${escapeHtml(titleOf(signal))}</b>`,
        ...bodyLines(signal).map(escapeHtml),
        `<a href="${escapeHtml(url)}">Открыть диалог</a>`,
    ].join('\n');
}

/** Тег колокольчика: оповещения одного диалога замещают друг друга. */
export function supportBellTag(lineDomain: string, sessionId: number): string {
    return `support-monitor:${lineDomain}:${sessionId}`;
}

export function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Квадратные скобки клиента не должны превратиться в разметку колокольчика. */
export function escapeBbCode(text: string): string {
    return text.replace(/\[/g, '(').replace(/\]/g, ')');
}
