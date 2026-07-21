import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@lib/core/redis/redis.service';
import {
    AicallSmartInfo,
    PbxAicallSmartService,
} from '@lib/portal-lib/pbx/pbx-aicall-smart';

/** Данные смарта на портале, нужные writer'у для записи элементов. */
export type CallReportSmartInfo = AicallSmartInfo;

/**
 * Резолвер смарта «AI-анализ звонков» — тонкая обёртка над каноническим
 * pbx-сервисом (PortalModel → fallback локальное зеркало PortalDB),
 * связка portal↔bitrix как у всех pbx-сущностей монорепы.
 *
 * invalidate() после установки чистит online-кэш портала `portal_${domain}`
 * (TTL 10ч, штатной инвалидации в монорепе нет) — иначе PortalModel не
 * увидит новые поля до истечения TTL.
 */
@Injectable()
export class CallReportSmartResolverService {
    private readonly logger = new Logger(CallReportSmartResolverService.name);

    constructor(
        private readonly aicallSmartService: PbxAicallSmartService,
        private readonly redisService: RedisService,
    ) {}

    /** Инфо смарта на портале или null, если смарт не установлен. */
    async resolve(domain: string): Promise<CallReportSmartInfo | null> {
        return this.aicallSmartService.resolveInfo(domain);
    }

    /** Сброс кэшей портала (вызывается установщиком после install-smart). */
    async invalidate(domain: string): Promise<void> {
        const redis = this.redisService.getClient();
        await redis
            .del(`portal_${domain}`)
            .catch(() => this.logger.warn(`Кэш portal_${domain} не сброшен`));
        // Legacy-ключ прежнего резолвера — чистим на случай остатков.
        await redis.del(`call-report:smart:${domain}`).catch(() => undefined);
    }
}
