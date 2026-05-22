import { Module } from '@nestjs/common';
import { PortalStageModule } from '@/modules/pbx-domain/stage';
import { BootstrapPortalCategoryStagesUseCase } from './use-cases/bootstrap-portal-category-stages.use-case';
import { ReconcilePortalCategoryStagesUseCase } from './use-cases/reconcile-portal-category-stages.use-case';
import { InstallStageSyncService } from './install-stage-sync.service';

/**
 * Установка/синхронизация стадий CRM (`crm.status.*` + `btx_stages`).
 */
@Module({
    imports: [PortalStageModule],
    providers: [
        InstallStageSyncService,
        BootstrapPortalCategoryStagesUseCase,
        ReconcilePortalCategoryStagesUseCase,
    ],
    exports: [
        InstallStageSyncService,
        BootstrapPortalCategoryStagesUseCase,
        ReconcilePortalCategoryStagesUseCase,
    ],
})
export class InstallStageModule {}
