import { Module } from '@nestjs/common';
import { PBXModule } from '@/modules/pbx';
import { PortalStoreModule } from '@lib/portal-lib';
import { PortalMeasureModule } from '@lib/portal-lib/konstructor';
import { PbxPortalMeasureController } from './controllers/pbx-portal-measure.controller';
import { PbxPortalMeasureMonitoringController } from './controllers/pbx-portal-measure-monitoring.controller';
import { SyncPortalMeasuresUseCase } from './use-cases/sync-portal-measures.use-case';
import { ManagePortalMeasureUseCase } from './use-cases/manage-portal-measure.use-case';
import { PbxPortalMeasureMonitoringService } from './services/pbx-portal-measure-monitoring.service';

/**
 * Управление портальными единицами измерения из pbx-install: синхронизация с
 * глобальным справочником, список по `domain` и monitoring-сводка PortalDB ↔ Bitrix.
 * Доменная логика — в konstructor, доступ к Bitrix — через PBXService (PBXModule).
 */
@Module({
    imports: [PBXModule, PortalStoreModule, PortalMeasureModule],
    controllers: [
        PbxPortalMeasureController,
        PbxPortalMeasureMonitoringController,
    ],
    providers: [
        SyncPortalMeasuresUseCase,
        ManagePortalMeasureUseCase,
        PbxPortalMeasureMonitoringService,
    ],
    exports: [
        SyncPortalMeasuresUseCase,
        ManagePortalMeasureUseCase,
        PbxPortalMeasureMonitoringService,
    ],
})
export class PbxPortalMeasureModule {}
