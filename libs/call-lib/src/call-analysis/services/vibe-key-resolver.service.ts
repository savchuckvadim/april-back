import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';
import { PortalKeysService } from '@lib/portal-lib/store/keys/portal-keys.service';

/** TTL кэша ключа в памяти, мс: не дёргаем БД на каждый звонок батча. */
const KEY_CACHE_TTL_MS = 60_000;

/**
 * Резолюция VibeCode-ключа для домена:
 * 1) пер-портальный ключ из БД (Portal.keys.vibeKey, хранится шифрованно,
 *    PortalKeysService отдаёт расшифрованным) — целевой источник:
 *    у разных клиентов свои ключи и квоты;
 * 2) fallback — env BITRIX_VIBE_TEST (общий тестовый ключ; исторический
 *    путь, оставлен для локалки и порталов без заведённого ключа).
 *
 * Ключ кэшируется в памяти на минуту, чтобы батч звонков не ходил в БД
 * на каждую транскрибацию/классификацию. Ошибка чтения портала не роняет
 * вызов — уходим в env-fallback с warn.
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
        private readonly configService: ConfigService,
    ) {}

    /** @throws если ключа нет ни в портале, ни в env. */
    async resolve(domain: string): Promise<string> {
        const cached = this.cache.get(domain);
        if (cached && cached.expiresAt > Date.now()) {
            return cached.key;
        }

        const portalKey = await this.readPortalKey(domain);
        if (portalKey) {
            this.logger.log(`VibeCode-ключ портала (${domain})`);
            this.cache.set(domain, {
                key: portalKey,
                expiresAt: Date.now() + KEY_CACHE_TTL_MS,
            });
            return portalKey;
        }

        const envKey = this.configService.get<string>('BITRIX_VIBE_TEST');
        if (envKey) {
            this.logger.warn(
                `VibeCode-ключ портала не задан (${domain}) — fallback на env BITRIX_VIBE_TEST`,
            );
            return envKey;
        }

        throw new Error(
            `VibeCode-ключ не найден для ${domain}: заведите vibeKey портала ` +
                `(admin/portal/:id/keys) или задайте BITRIX_VIBE_TEST`,
        );
    }

    /** Сброс кэша ключей (после смены ключа в админке). */
    invalidate(domain?: string): void {
        if (domain) this.cache.delete(domain);
        else this.cache.clear();
        this.logger.log(`Кэш VibeCode-ключей сброшен (${domain ?? 'все'})`);
    }

    private async readPortalKey(domain: string): Promise<string | null> {
        try {
            const portal = await this.portalStore.getPortalByDomain(domain);
            if (!portal) return null;
            return await this.portalKeys.get(Number(portal.id), 'vibeKey');
        } catch (error) {
            this.logger.warn(
                `vibeKey портала не прочитан (${domain}): ${(error as Error).message}`,
            );
            return null;
        }
    }
}
