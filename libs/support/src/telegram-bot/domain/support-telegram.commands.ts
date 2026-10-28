/**
 * Команды бота поддержки. Латинские команды Telegram работают в группе
 * всегда (`/analyze 769`), русские фразы — когда у бота выключен режим
 * приватности или ему написали лично / с упоминанием.
 */

export type SupportTelegramCommand =
    | { kind: 'help' }
    | { kind: 'dialogs' }
    | { kind: 'analyze'; query: string };

/** Действия кнопок под черновиком. */
export const SUPPORT_CALLBACK_ACTIONS = ['send', 'task', 'discard'] as const;
export type SupportCallbackAction = (typeof SUPPORT_CALLBACK_ACTIONS)[number];

export interface SupportTelegramCallback {
    action: SupportCallbackAction;
    draftId: string;
}

/** Префикс callback_data: лимит Telegram 64 байта, id черновика короткий. */
const CALLBACK_PREFIX = 'sa';

const HELP_WORDS = new Set(['/start', '/help', 'помощь', 'справка', 'help']);
const DIALOGS_WORDS = new Set([
    '/dialogs',
    '/support',
    'диалоги',
    'поддержка',
    'очередь',
]);
const ANALYZE_WORDS = new Set(['/analyze', 'разбери', 'разбор', 'разберись']);

const isAction = (value: string): value is SupportCallbackAction =>
    (SUPPORT_CALLBACK_ACTIONS as readonly string[]).includes(value);

/**
 * Текст сообщения → команда; не команда — null (в группе люди
 * переписываются и между собой). Упоминание бота в начале и суффикс
 * `@бот` у команды отбрасываются.
 */
export function parseSupportCommand(
    text: string | undefined,
): SupportTelegramCommand | null {
    const cleaned = (text ?? '')
        .trim()
        .replace(/^@\w+[\s,:]*/u, '')
        .replace(/^(\/[a-z_]+)@\w+/iu, '$1')
        .trim();
    if (!cleaned) return null;
    const lower = cleaned.toLowerCase();
    if (/^что в поддержке/u.test(lower)) return { kind: 'dialogs' };

    const [head = '', ...rest] = cleaned.split(/\s+/u);
    const word = head.toLowerCase().replace(/[?!.,:]+$/u, '');
    if (HELP_WORDS.has(word)) return { kind: 'help' };
    if (DIALOGS_WORDS.has(word) && !rest.length) return { kind: 'dialogs' };
    if (ANALYZE_WORDS.has(word)) {
        const query = rest
            .join(' ')
            .replace(/^((диалог|с|клиента?)\s+)+/iu, '')
            .replace(/^[«"']|[»"']$/gu, '')
            .trim();
        return { kind: 'analyze', query };
    }
    return null;
}

export function buildSupportCallback(
    action: SupportCallbackAction,
    draftId: string,
): string {
    return `${CALLBACK_PREFIX}:${action}:${draftId}`;
}

export function parseSupportCallback(
    data: string | undefined,
): SupportTelegramCallback | null {
    const [prefix, action, draftId, ...extra] = (data ?? '').split(':');
    if (prefix !== CALLBACK_PREFIX || extra.length) return null;
    if (!action || !isAction(action) || !draftId) return null;
    return { action, draftId };
}
