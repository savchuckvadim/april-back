import { Module } from '@nestjs/common';
import { RedisModule } from '@lib/core/redis/redis.module';
import { PortalRepository } from '../portal.repository';
import { PortalPrismaRepository } from '../portal.prisma.repository';
import { PortalAppSettingsRepository } from './portal-app-settings.repository';
import { PortalAppSettingsPrismaRepository } from './portal-app-settings.prisma.repository';
import { PortalAppSettingsService } from './portal-app-settings.service';

/**
 * ЛЁГКИЙ сервисный модуль настроек приложений портала — БЕЗ контроллеров
 * и без остального стора (ключи/outer/крипта сюда не тянутся): прикладные
 * приложения (event-sales и др.) импортируют его ради
 * `PortalAppSettingsService.resolve(domain, app)` и ничего лишнего не
 * получают ни в DI, ни в Swagger. Админ-роуты — в
 * {@link PortalAppSettingsAdminModule}.
 */
@Module({
    imports: [RedisModule],
    providers: [
        { provide: PortalRepository, useClass: PortalPrismaRepository },
        {
            provide: PortalAppSettingsRepository,
            useClass: PortalAppSettingsPrismaRepository,
        },
        PortalAppSettingsService,
    ],
    exports: [PortalAppSettingsService],
})
export class PortalAppSettingsModule {}
