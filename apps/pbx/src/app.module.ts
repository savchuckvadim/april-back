import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from '@lib/logger';
import { MetricsModule } from '@lib/metrics';
import { GlobalExceptionFilter, HealthModule } from '@/core';
import { RedisModule } from '@/core/redis/redis.module';
import { PbxCacheModule } from './pbx-cache/pbx-cache.module';
import { BxDepartmentModule } from 'libs/bx-department';
import { MarketplaceModule } from './marketplace/marketplace.module';
import { PrismaModule } from '@lib/core/prisma/prisma.module';
import { PortalBuilderModule } from '@lib/portal-lib/builder';
import { RenewalOfferPublicModule } from '@lib/renewal-offer';
import { VendorSettingsModule } from '@lib/portal-lib/store/vendor-settings/vendor-settings.module';
import { CabinetApiModule, CabinetMailTransportModule } from '@lib/cabinet';

/**
 * Корневой модуль приложения pbx.
 *
 * Назначение: единый кэш общих для разных приложений данных портала
 * (Portal, Providers, Contracts, Favorites, Templates, Cache, Departments,
 * UserFilters). Данные хранятся в Redis и переживают перезапуск/удаление
 * контейнера за счёт volume + AOF-персистентности (см. infra/compose).
 *
 * Архитектура: app зависит только от общих библиотек (libs/*) и собственного
 * feature-модуля PbxCacheModule. Доступ к Redis — через RedisService из @/core.
 */
@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: ['apps/pbx/.env', '.env'],
            ignoreEnvFile: false,
            load: [
                () => ({
                    REDIS_URL: process.env.REDIS_URL,
                    REDIS_HOST: process.env.REDIS_HOST,
                    REDIS_PORT: process.env.REDIS_PORT,
                    REDIS_USER: process.env.REDIS_USER,
                    REDIS_PASSWORD: process.env.REDIS_PASSWORD,
                }),
            ],
        }),
        LoggerModule.forRoot({ appName: 'pbx' }),
        MetricsModule.forRoot({ appName: 'pbx' }),
        PrismaModule,
        HealthModule,
        RedisModule,
        PbxCacheModule,
        BxDepartmentModule,
        MarketplaceModule,
        PortalBuilderModule,
        RenewalOfferPublicModule,
        // Настройки вендора из админки (клиентский Telegram-бот, прокси за
        // рубеж) — глобальный читатель для библиотек приложения.
        VendorSettingsModule,
        // Кабинет клиента-портала (07.11.2026): вход с сайта, участники,
        // доступ из фрейма, привязка Telegram. SMTP — свой транспорт без
        // публичного MailController (без MAIL_HOST письма не уходят).
        CabinetMailTransportModule.forApp(),
        CabinetApiModule,
    ],
    providers: [GlobalExceptionFilter],
    exports: [BxDepartmentModule],
})
export class AppModule {}
