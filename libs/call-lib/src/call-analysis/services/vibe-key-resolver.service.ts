import { Injectable, Logger } from '@nestjs/common';
import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';
import { PortalKeysService } from '@lib/portal-lib/store/keys/portal-keys.service';

/** TTL кэша ключа в памяти, мс: не дёргаем БД на каждый звонок батча. */
const KEY_CACHE_TTL_MS = 60_000;

/**
 * Резолюция VibeCode-ключа домена — ЕДИНСТВЕННЫЙ источник: пер-портальный
 * ключ из БД (Portal.keys.vibeKey, хранится шифрованно, PortalKeysService
 * отдаёт расшифрованным). У разных клиентов свои ключи и квоты; ключ
 * заводится в админке admin/portal/:portalId/keys.
 *
 * Env-fallback (BITRIX_VIBE_TEST) выпилен 2026-07-23: ключей в env
 * больше нет, отсутствие ключа портала — ошибка с понятным текстом.
 *
 * Ключ кэшируется в памяти на минуту, чтобы батч звонков не ходил в БД
 * на каждую транскрибацию/классификацию; invalidate() — после смены
 * ключа в админке.
 */
@Injectable()
export class VibeKeyResolverService {
    private readonly logger = new Logger(VibeKeyResolverService.name);
    private readonly cache = new Map<
        string,
        { key: string; expiresAt: number }
    >();

    constructor(
        private readonly portalStore: PortalStoreService,
        private readonly portalKeys: PortalKeysService,
    ) {}

    /** @throws если у портала не заведён vibeKey (или портал не найден). */
    async resolve(domain: string): Promise<string> {
        const cached = this.cache.get(domain);
        if (cached && cached.expiresAt > Date.now()) {
            return cached.key;
        }

        const portal = await this.portalStore.getPortalByDomain(domain);
        if (!portal) {
            throw new Error(
                `VibeCode-ключ не получен: портал ${domain} не найден в БД`,
            );
        }
        const key = await this.portalKeys.get(Number(portal.id), 'vibeKey');
        if (!key) {
            throw new Error(
                `VibeCode-ключ не заведён для ${domain}: задайте vibeKey ` +
                    `портала в админке (admin/portal/${portal.id}/keys)`,
            );
        }

        this.logger.log(`VibeCode-ключ портала получен (${domain})`);
        this.cache.set(domain, {
            key,
            expiresAt: Date.now() + KEY_CACHE_TTL_MS,
        });
        return key;
    }

    /** Сброс кэша ключей (после смены ключа в админке). */
    invalidate(domain?: string): void {
        if (domain) this.cache.delete(domain);
        else this.cache.clear();
        this.logger.log(`Кэш VibeCode-ключей сброшен (${domain ?? 'все'})`);
    }
}
