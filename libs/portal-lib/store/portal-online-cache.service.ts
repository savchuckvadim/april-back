import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@lib/core/redis/redis.service';

/**
 * Инвалидация online-кэша портала `portal_${domain}` (TTL 10 ч, штатной
 * инвалидации в монорепе нет). ОБЯЗАТЕЛЬНА после любой установки/изменения
 * pbx-сущностей (смарты, списки, поля) — иначе PortalModel в боевых
 * приложениях не увидит изменения до истечения TTL.
 *
 * Fail-open: недоступный Redis не роняет установку — только warn в лог.
 */
@Injectable()
export class PortalOnlineCacheService {
    private readonly logger = new Logger(PortalOnlineCacheService.name);

    constructor(private readonly redisService: RedisService) {}

    async invalidate(domain: string): Promise<void> {
        try {
            await this.redisService.getClient().del(`portal_${domain}`);
        } catch (error) {
            this.logger.warn(
                `Кэш portal_${domain} не сброшен: ${(error as Error).message}`,
            );
        }
    }
}
