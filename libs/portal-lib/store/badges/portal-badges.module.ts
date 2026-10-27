import { Module } from '@nestjs/common';
import { RedisModule } from '@lib/core/redis/redis.module';
import { PortalRepository } from '../portal.repository';
import { PortalPrismaRepository } from '../portal.prisma.repository';
import { PortalAppSettingsRepository } from '../app-settings/portal-app-settings.repository';
import { PortalAppSettingsPrismaRepository } from '../app-settings/portal-app-settings.prisma.repository';
import {
    PortalBadgesAppSettingsRepository,
    PortalBadgesRepository,
} from './portal-badges.repository';
import { PortalBadgesService } from './portal-badges.service';

/**
 * ЛЁГКИЙ сервисный модуль каталога бейджиков — БЕЗ контроллеров:
 * прикладные приложения (event-sales) импортируют его ради
 * `PortalBadgesService.resolve(domain)` и заводят свой тонкий контроллер
 * чтения. Админ-роуты — в {@link PortalBadgesAdminModule}
 * (ai/rules/app-api-surface.md).
 *
 * Хранилище — JSON-ключ в `portal_app_settings`, поэтому репозиторий
 * настроек приложений заведён здесь напрямую, а не через сервис настроек:
 * тот знает только скалярные ключи реестра.
 */
@Module({
    imports: [RedisModule],
    providers: [
        { provide: PortalRepository, useClass: PortalPrismaRepository },
        {
            provide: PortalAppSettingsRepository,
            useClass: PortalAppSettingsPrismaRepository,
        },
        {
            provide: PortalBadgesRepository,
            useClass: PortalBadgesAppSettingsRepository,
        },
        PortalBadgesService,
    ],
    exports: [PortalBadgesService],
})
export class PortalBadgesModule {}
