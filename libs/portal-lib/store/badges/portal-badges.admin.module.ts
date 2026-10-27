import { Module } from '@nestjs/common';
import { PortalBadgesModule } from './portal-badges.module';
import { PortalBadgesController } from './portal-badges.controller';

/**
 * Админ-слой каталога бейджиков (`admin/portal/:portalId/badges`):
 * импортирует лёгкий {@link PortalBadgesModule} ради сервиса и регистрирует
 * ТОЛЬКО админ-контроллер. Подключать в apps/admin, а не в event-sales —
 * иначе редактор попадёт в Swagger фрейма (ai/rules/app-api-surface.md).
 */
@Module({
    imports: [PortalBadgesModule],
    controllers: [PortalBadgesController],
})
export class PortalBadgesAdminModule {}
