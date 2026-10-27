import { Module } from '@nestjs/common';
import { PortalBadgesModule } from '@lib/portal-lib/store/badges/portal-badges.module';
import { BadgesController } from './badges.controller';

/**
 * Публичное чтение каталога бейджиков для фрейма «Звонки»
 * (GET /badges?domain=…). Пишется каталог только из админки, поэтому здесь
 * один контроллер и ни одного провайдера.
 *
 * Импортируется ЛЁГКИЙ lib-модуль глубоким путём — он даёт сервис и не
 * тянет админ-контроллер в Swagger приложения (ai/rules/app-api-surface.md).
 */
@Module({
    imports: [PortalBadgesModule],
    controllers: [BadgesController],
})
export class EventSalesBadgesModule {}
