/**
 * Имя socket.io-комнаты владельца ссылок для presence-пушей.
 * Владелец (во фрейме) подписывается на свою комнату (room:join), бэк
 * пушит туда `share:presence {token, online}` при heartbeat зрителей.
 * Формат общий для фронта и бэка — держим в одном месте.
 */
export const SHARE_PRESENCE_EVENT = 'share:presence' as const;

export const sharePresenceRoom = (
    domain: string,
    creatorBxUserId: number,
): string => `share-presence:${domain}:${creatorBxUserId}`;
