import type { IBXImOpenlinesV2Session } from '@lib/bitrix';
import type {
    IBXImV2ChatMessage,
    IBXImV2ChatMessageTailResponse,
    IBXImV2ChatUser,
} from '@lib/bitrix/domain/chat/im-v2-chat-message';
import {
    SUPPORT_OPEN_STATUSES,
    SupportAuthorRole,
    SupportDialog,
    SupportMessage,
    SupportOpenStatus,
} from '../domain/support-dialog.types';
import { toSupportPlainText } from '../domain/support-text.util';

const isOpenStatus = (status: string): status is SupportOpenStatus =>
    (SUPPORT_OPEN_STATUSES as readonly string[]).includes(status);

/** Хост портала из `website` участника Network: `https://x.bitrix24.ru` → `x.bitrix24.ru`. */
export function portalHostOf(website: string | undefined): string | null {
    const raw = String(website ?? '').trim();
    if (!raw) return null;
    try {
        return new URL(raw.includes('://') ? raw : `https://${raw}`).host;
    } catch {
        return null;
    }
}

/**
 * Роль автора сообщения.
 * - Система (`isSystem`, автор 0) и боты линии — `other`: ответом не считаются.
 * - Клиент — пользователь сессии или любой участник-коннектор.
 * - Остальные живые пользователи портала — сотрудники.
 */
export function authorRoleOf(
    message: IBXImV2ChatMessage,
    clientUserId: number,
    users: ReadonlyMap<number, IBXImV2ChatUser>,
): SupportAuthorRole {
    if (message.isSystem || !message.authorId) return 'other';
    if (message.authorId === clientUserId) return 'client';
    const author = users.get(message.authorId);
    if (author?.connector) return 'client';
    if (author?.bot || author?.type === 'bot') return 'other';
    return 'staff';
}

const toMessage = (
    message: IBXImV2ChatMessage,
    clientUserId: number,
    users: ReadonlyMap<number, IBXImV2ChatUser>,
): SupportMessage => ({
    id: message.id,
    at: new Date(message.date),
    role: authorRoleOf(message, clientUserId, users),
    authorName: users.get(message.authorId)?.name ?? null,
    text: toSupportPlainText(message.text),
});

/**
 * Запас на часы портала: сообщение, открывшее сессию, бывает на секунду
 * раньше её `dateCreate`.
 */
export const SUPPORT_SESSION_START_SKEW_MS = 60_000;

/**
 * Сообщение относится к сессии: у клиента один чат на все обращения, и в
 * хвосте лежат сообщения прошлых сессий. Без отсечки старое неотвеченное
 * сообщение раздуло бы ожидание в новой сессии.
 */
const isInSession = (message: IBXImV2ChatMessage, sessionStart: number) => {
    const at = new Date(message.date).getTime();
    if (!Number.isFinite(at)) return false;
    return !Number.isFinite(sessionStart) || at >= sessionStart;
};

/**
 * Сессия линии + последние сообщения её чата → доменный диалог.
 * Закрытые и прочие статусы — null: монитор смотрит только открытые.
 * Нет сообщений (пачка их не вернула) — диалог с пустой перепиской:
 * о новом диалоге всё равно нужно сказать.
 */
export function toSupportDialog(
    session: IBXImOpenlinesV2Session,
    tail: IBXImV2ChatMessageTailResponse | null,
): SupportDialog | null {
    if (!isOpenStatus(session.status)) return null;

    const users = new Map<number, IBXImV2ChatUser>(
        (tail?.users ?? []).map(user => [user.id, user]),
    );
    const client = users.get(session.userId);
    const sessionStart =
        new Date(session.dateCreate).getTime() - SUPPORT_SESSION_START_SKEW_MS;
    const messages = (tail?.messages ?? [])
        .filter(message => isInSession(message, sessionStart))
        .map(message => toMessage(message, session.userId, users))
        .sort((left, right) => left.id - right.id);

    return {
        sessionId: session.id,
        chatId: session.chatId,
        lineId: session.configId,
        source: session.source,
        status: session.status,
        createdAt: new Date(session.dateCreate),
        operatorId: session.operatorId || 0,
        operatorName: users.get(session.operatorId)?.name ?? null,
        client: {
            userId: session.userId,
            name: client?.name ?? `клиент №${session.userId}`,
            portal: portalHostOf(client?.website),
        },
        crm:
            session.crmEntityType && session.crmEntityId
                ? {
                      entityType: session.crmEntityType,
                      entityId: session.crmEntityId,
                  }
                : null,
        messages,
    };
}
