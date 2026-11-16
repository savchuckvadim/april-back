import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { UserNamesReader } from '../domain/loaders/user-names.reader';
import { CALL_PAGE_MANAGER_NAME_TTL_SEC } from './call-page.const';

interface CachedName {
    name: string | null;
    until: number;
}

/** Больше стольких имён в памяти не держим — устаревшие вычищаются. */
const CACHE_LIMIT = 500;

/**
 * Имя менеджера звонка для шапки страницы. Портал спрашиваем не на каждое
 * открытие: имя помнится час. Сбой чтения — страница без имени, не ошибка.
 *
 * Инстанс Битрикса берётся на каждый запрос (`PBXService.init(domain)`) и в
 * сервисе не хранится.
 */
@Injectable()
export class CallPageManagerNameService {
    private readonly logger = new Logger(CallPageManagerNameService.name);
    private readonly cache = new Map<string, CachedName>();

    constructor(private readonly pbx: PBXService) {}

    async nameOf(
        domain: string,
        userId: string | null,
        now: number = Date.now(),
    ): Promise<string | null> {
        const id = Number(userId);
        if (!userId || !Number.isInteger(id) || id <= 0) return null;
        const key = `${domain}:${id}`;
        const cached = this.cache.get(key);
        if (cached && cached.until > now) return cached.name;
        try {
            const { bitrix } = await this.pbx.init(domain);
            const names = await new UserNamesReader(bitrix).read([String(id)]);
            const name = names.get(String(id)) ?? null;
            this.remember(key, name, now);
            return name;
        } catch (error) {
            this.logger.warn(
                `Имя менеджера ${id} (${domain}) для страницы звонка не прочитано: ${(error as Error).message}`,
            );
            return null;
        }
    }

    private remember(key: string, name: string | null, now: number): void {
        if (this.cache.size >= CACHE_LIMIT) {
            for (const [cachedKey, cached] of this.cache) {
                if (cached.until <= now) this.cache.delete(cachedKey);
            }
            if (this.cache.size >= CACHE_LIMIT) this.cache.clear();
        }
        this.cache.set(key, {
            name,
            until: now + CALL_PAGE_MANAGER_NAME_TTL_SEC * 1000,
        });
    }
}
