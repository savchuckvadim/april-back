import { Module } from '@nestjs/common';
import { PortalStoreModule } from '@lib/portal-lib';
import { PortalMeasureModule } from '@lib/portal-lib/konstructor';
import { PbxPortalMeasureController } from './controllers/pbx-portal-measure.controller';
import { SyncPortalMeasuresUseCase } from './use-cases/sync-portal-measures.use-case';

/**
 * Управление портальными единицами измерения из pbx-install: синхронизация с
 * глобальным справочником и список по `domain`. Доменная логика — в konstructor.
 */
@Module({
    imports: [PortalStoreModule, PortalMeasureModule],
    controllers: [PbxPortalMeasureController],
    providers: [SyncPortalMeasuresUseCase],
    exports: [SyncPortalMeasuresUseCase],
})
export class PbxPortalMeasureModule {}
