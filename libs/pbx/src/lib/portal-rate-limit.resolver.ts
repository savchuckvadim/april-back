import { Logger } from '@nestjs/common';
import type { BitrixRateLimitOverrides } from '@lib/bitrix/core/rate-limit/bitrix-rate-limiter.config';
import {
    EnumPortalAppCode,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import { TimedCache } from '@lib/shared';
import { toBitrixRateLimitOverrides } from './bitrix-rate-limit.settings';

/**
 * Сколько лимит запросов портала (его настройки) живёт в памяти процесса.
 * Поменяли в админке — подхватится в течение минуты.
 */
const RATE_LIMIT_SETTINGS_TTL_MS = 60_000;

/**
 * Лимит запросов к Битриксу для портала — из его «Общих настроек».
 *
 * Читается на каждый `PBXService.init`, поэтому держится в памяти минуту.
 * Сбой чтения настроек init не ломает: работаем со значениями по умолчанию
 * ограничителя. Не `@Injectable` — создаётся сервисом PBX.
 */
export class PortalRateLimitResolver {
    private readonly cache = new TimedCache<BitrixRateLimitOverrides>(
        RATE_LIMIT_SETTINGS_TTL_MS,
    );

    constructor(
        private readonly settings: PortalAppSettingsService | undefined,
        private readonly logger: Logger,
    ) {}

    async resolve(
        domain: string,
    ): Promise<BitrixRateLimitOverrides | undefined> {
        const settings = this.settings;
        if (!settings) return undefined;
        try {
            return await this.cache.get(domain, async () =>
                toBitrixRateLimitOverrides(
                    await settings.resolveWithStored(
                        domain,
                        EnumPortalAppCode.portal,
                    ),
                ),
            );
        } catch (error) {
            this.logger.warn(
                `[${domain}] настройки лимита запросов не прочитаны — ` +
                    `значения по умолчанию: ${(error as Error).message}`,
            );
            return undefined;
        }
    }
}
