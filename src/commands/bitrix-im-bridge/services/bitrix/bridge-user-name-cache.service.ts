import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { RedisService } from '@/core/redis/redis.service';
import { IBXUser } from '@/modules/bitrix/domain/interfaces/bitrix.interface';

type CachedUserName = {
    name: string;
    lastName: string;
    email: string;
};

type UserGetResponse = {
    result?: IBXUser[];
};

const CACHE_TTL_SECONDS = 60 * 60 * 24; // 24 часа

@Injectable()
export class BridgeUserNameCacheService {
    private readonly logger = new Logger(BridgeUserNameCacheService.name);
    private readonly keyPrefix = 'bitrix-im-bridge:user-cache';

    constructor(
        private readonly pbx: PBXService,
        private readonly redis: RedisService,
    ) {}

    async resolveName(domain: string, authorId: string): Promise<string> {
        if (!authorId || authorId === '0') return 'Система';

        const cached = await this.getFromCache(domain, authorId);
        if (cached) return this.formatName(cached);

        const fetched = await this.fetchFromBitrix(domain, authorId);
        if (!fetched) return `ID: ${authorId}`;

        await this.saveToCache(domain, authorId, fetched);
        return this.formatName(fetched);
    }

    private async getFromCache(
        domain: string,
        authorId: string,
    ): Promise<CachedUserName | undefined> {
        const raw = await this.redis
            .getClient()
            .get(`${this.keyPrefix}:${domain}:${authorId}`);
        if (!raw) return undefined;
        try {
            return JSON.parse(raw) as CachedUserName;
        } catch {
            return undefined;
        }
    }

    private async saveToCache(
        domain: string,
        authorId: string,
        data: CachedUserName,
    ): Promise<void> {
        await this.redis
            .getClient()
            .set(
                `${this.keyPrefix}:${domain}:${authorId}`,
                JSON.stringify(data),
                'EX',
                CACHE_TTL_SECONDS,
            );
    }

    private async fetchFromBitrix(
        domain: string,
        authorId: string,
    ): Promise<CachedUserName | undefined> {
        try {
            const { bitrix } = await this.pbx.init(domain);
            const response = (await bitrix.user.get(
                { ID: authorId },
                ['ID', 'NAME', 'LAST_NAME', 'EMAIL'],
            )) as UserGetResponse;

            const user = response?.result?.[0];
            if (!user) {
                this.logger.warn(`Пользователь не найден: domain=${domain}, authorId=${authorId}`);
                return undefined;
            }

            return {
                name: String(user.NAME ?? ''),
                lastName: String(user.LAST_NAME ?? ''),
                email: String(user.EMAIL ?? ''),
            };
        } catch (error) {
            this.logger.error(
                `Ошибка получения пользователя: domain=${domain}, authorId=${authorId}`,
                error,
            );
            return undefined;
        }
    }

    private formatName(user: CachedUserName): string {
        const fullName = [user.name, user.lastName].filter(Boolean).join(' ');
        if (!fullName && !user.email) return 'Неизвестный';
        if (!fullName) return user.email;
        if (user.email) return `${fullName} (${user.email})`;
        return fullName;
    }
}
