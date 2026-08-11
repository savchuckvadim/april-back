import { Module } from '@nestjs/common';
import { QueueModule } from '@lib/queue';
import { PortalAppSettingsModule } from '@lib/portal-lib/store/app-settings';
import { SkapStoreModule } from '@lib/skap-lib';
import { SkapPortalController } from './skap-portal.controller';

/**
 * Портальный модуль СКАП для фронта kpi-service: «пересчитать» + статус.
 * В Swagger kpi-report-service торчат только эти два роута — конвейер и
 * админ-поверхность живут в своих приложениях (app-api-surface).
 */
@Module({
    imports: [QueueModule, PortalAppSettingsModule, SkapStoreModule],
    controllers: [SkapPortalController],
})
export class SkapPortalModule {}
