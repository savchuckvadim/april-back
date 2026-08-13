import { Module } from '@nestjs/common';
import { QueueModule } from '@lib/queue';
import { PortalAppSettingsModule } from '@lib/portal-lib/store/app-settings';
import { PbxSkapSmartModule } from '@lib/portal-lib/pbx/pbx-skap-smart';
import { SkapPortalService, SkapStoreModule } from '@lib/skap-lib';
import { SkapPortalController } from './skap-portal.controller';

/**
 * Портальный модуль СКАП для фронта kpi-service: «пересчитать» + статус.
 * В Swagger kpi-report-service торчат только эти два роута — конвейер и
 * админ-поверхность живут в своих приложениях (app-api-surface).
 */
@Module({
    imports: [
        QueueModule,
        PortalAppSettingsModule,
        PbxSkapSmartModule,
        SkapStoreModule,
    ],
    controllers: [SkapPortalController],
    providers: [SkapPortalService],
})
export class SkapPortalModule {}
