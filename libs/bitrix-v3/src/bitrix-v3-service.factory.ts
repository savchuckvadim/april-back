import { Injectable, Optional } from '@nestjs/common';
import { BitrixRateLimiterService } from '@lib/bitrix/core/rate-limit/bitrix-rate-limiter.service';
import { BitrixV3Service } from './bitrix-v3.service';
import { BitrixV3CoreService } from './core/base/bitrix-v3-core.service';
import { IBitrixV3Credentials } from './core/interface/bitrix-v3-credentials.interface';

/**
 * Фабрика клиентов REST 3.0. Единственный injectable в библиотеке.
 *
 * Rate limiter общий с @lib/bitrix (единственная связь между
 * библиотеками): лимиты Битрикса на портал общие для v1 и v3,
 * поэтому квоту делит один leaky bucket в Redis
 * (ключ bitrix:rate:{domain}). @Optional — без лимитера фабрика
 * работает в режиме passthrough.
 */
@Injectable()
export class BitrixV3ServiceFactory {
    constructor(
        @Optional()
        private readonly rateLimiter: BitrixRateLimiterService | null,
    ) {}

    create(credentials: IBitrixV3Credentials): BitrixV3Service {
        const transport = new BitrixV3CoreService(
            credentials,
            this.rateLimiter,
        );
        return new BitrixV3Service(transport);
    }
}
