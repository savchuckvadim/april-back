import { BITRIX_APP_CODES } from '@lib/bitrix-setup/app/enums/bitrix-app.enum';

/**
 * Конвенция кодов строк `bitrix_app_secrets` для OAuth-кред приложений.
 *
 * Два мира кред:
 *  - ТИРАЖНОЕ приложение — ОДНА пара на всех: code = 'garant_manager'
 *    (BITRIX_APP_CODES.GARANT). Публикация в каталоге отложена
 *    (ai/marketplace/publication/10-tirazhnost-rejection.md), но контур жив.
 *  - ЛОКАЛЬНОЕ приложение — СВОЯ пара НА КАЖДЫЙ портал: клиент сам создаёт
 *    приложение у себя в Битрикс24 и вносит client_id/secret
 *    (ai/tasks/bitrix-local-app-distribution.md).
 *
 * Локальные креды адресуются ДВУМЯ ключами, и это не дублирование:
 *  - по ДОМЕНУ — единственное, что клиент знает ДО установки (member_id
 *    выдаёт Битрикс только в payload установки), поэтому форма клиента
 *    пишет именно этот ключ;
 *  - по MEMBER_ID — постоянный идентификатор портала. Домен переименовывают
 *    (Битрикс это позволяет), и после переименования ключ по домену
 *    перестанет находиться, а рефреш молча уедет на тиражные креды и
 *    получит wrong_client. Поэтому при установке креды перепривязываются
 *    к member_id (см. MarketplaceInstallService), а резолв идёт
 *    member_id → domain → тиражные → env.
 */

/** Префикс кодов локальных приложений (отличает их от тиражного) */
export const LOCAL_APP_SECRET_PREFIX = 'garant_local';

/** Код тиражного приложения (одна пара кред на все порталы) */
export const SHARED_APP_SECRET_CODE = BITRIX_APP_CODES.GARANT as string;

/**
 * Нормализация домена портала к виду `april-dev.bitrix24.ru`.
 *
 * Клиент вводит домен руками — приходит и `https://April-Dev.bitrix24.ru/`,
 * и с пробелами. Без нормализации строка, записанная формой, не совпадёт
 * с доменом из payload установки, и креды «пропадут».
 */
export function normalizePortalDomain(domain: string): string {
    return domain
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/\/+$/, '')
        .split('/')[0];
}

/** Код кред локального приложения по домену портала (ключ до установки) */
export function localAppSecretCodeByDomain(domain: string): string {
    return `${LOCAL_APP_SECRET_PREFIX}:${normalizePortalDomain(domain)}`;
}

/** Код кред локального приложения по member_id (постоянный ключ) */
export function localAppSecretCodeByMemberId(memberId: string): string {
    return `${LOCAL_APP_SECRET_PREFIX}:mid:${memberId.trim().toLowerCase()}`;
}

/** Является ли код кодом локального приложения (для админки/диагностики) */
export function isLocalAppSecretCode(code: string): boolean {
    return code.startsWith(`${LOCAL_APP_SECRET_PREFIX}:`);
}
