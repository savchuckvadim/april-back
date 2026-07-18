import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PrismaService } from '@/core';
import { RedisModule } from '@/core/redis/redis.module';
import { MarketplaceAuthRepository } from './persistence/marketplace-auth.repository';
import { MarketplaceComponentStateRepository } from './persistence/marketplace-component-state.repository';
import { MarketplaceTokenService } from './refresh/marketplace-token.service';

/**
 * Общий код маркетплейс-мира для apps/pbx и apps/pbx-install:
 * токены установок (refresh через oauth.bitrix24.tech), по-компонентные
 * статусы установки, контракт очереди provisioning.
 *
 * СОЗНАТЕЛЬНО НЕ @Global и НЕ биндит BITRIX_TOKEN_PROVIDER — глобальный
 * порт остаётся за legacy libs/bitrix-auth (bitrix_apps/bitrix_tokens);
 * marketplace-потребители инжектят MarketplaceTokenService явно.
 */
@Module({
    imports: [HttpModule, RedisModule],
    providers: [
        PrismaService,
        MarketplaceAuthRepository,
        MarketplaceComponentStateRepository,
        MarketplaceTokenService,
    ],
    exports: [
        MarketplaceAuthRepository,
        MarketplaceComponentStateRepository,
        MarketplaceTokenService,
    ],
})
export class MarketplaceCoreModule {}
