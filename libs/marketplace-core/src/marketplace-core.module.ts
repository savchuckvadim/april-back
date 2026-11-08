import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PrismaService } from '@/core';
import { RedisModule } from '@/core/redis/redis.module';
import { MarketplaceAuthRepository } from './persistence/marketplace-auth.repository';
import { MarketplaceComponentStateRepository } from './persistence/marketplace-component-state.repository';
import { LocalAppKeysRepository } from './persistence/local-app-keys.repository';
import { MarketplaceAppSecretsResolver } from './refresh/marketplace-app-secrets.resolver';
import { MarketplaceTokenService } from './refresh/marketplace-token.service';
import { LocalAppConnectionService } from './local-app/local-app-connection.service';

/**
 * Общий код установок приложения April (локальные приложения; ветки
 * Маркета — образец, см. MARKETPLACE_SHARED_APP_ENABLED): токены установок
 * (refresh через oauth.bitrix24.tech) с ключами портала, по-компонентные
 * статусы установки, контракт очереди provisioning, подключение портала
 * локальным приложением (LocalAppConnectionService — кабинет и админка).
 *
 * СОЗНАТЕЛЬНО НЕ @Global и НЕ биндит BITRIX_TOKEN_PROVIDER — глобальный
 * порт остаётся за legacy libs/bitrix-auth (bitrix_apps/bitrix_tokens);
 * потребители инжектят MarketplaceTokenService явно.
 */
@Module({
    imports: [HttpModule, RedisModule],
    providers: [
        PrismaService,
        MarketplaceAuthRepository,
        MarketplaceComponentStateRepository,
        MarketplaceAppSecretsResolver,
        MarketplaceTokenService,
        LocalAppKeysRepository,
        LocalAppConnectionService,
    ],
    exports: [
        MarketplaceAuthRepository,
        MarketplaceComponentStateRepository,
        MarketplaceTokenService,
        LocalAppConnectionService,
    ],
})
export class MarketplaceCoreModule {}
