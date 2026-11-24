import { Module } from '@nestjs/common';
import { RegionModule } from './region.module';
import { RegionController } from './region.controller';
import { PortalRegionController } from './portal-region/portal.region.controller';

/**
 * Админ-слой регионов гаранта: `/region` и `/portal-region/*` (чтение и
 * запись цен регионов портала). Контроллерам нужны RegionService и
 * PortalRegionService, оба экспортирует {@link RegionModule}. Подключать
 * ТОЛЬКО в приложении админки, под её авторизацией; konstructor этот
 * модуль не импортирует (ai/rules/app-api-surface.md).
 */
@Module({
    imports: [RegionModule],
    controllers: [RegionController, PortalRegionController],
})
export class RegionAdminModule {}
