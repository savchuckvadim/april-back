import { Module } from '@nestjs/common';
import { PBXModule } from '@/modules/pbx';
import { PortalStoreModule } from '@lib/portal-lib/store';
import { PortalSmartModule } from '@lib/portal-lib/pbx-domain/portal-smart';
import { PbxPresentationSmartModule } from '@lib/portal-lib/pbx/pbx-presentation-smart';
import { InstallCategoryModule } from '@app/pbx-install/category/install-category.module';
import { InstallStageModule } from '@app/pbx-install/stage/install-stage.module';
import { InstallSmartCategoriesService } from '../services/smart-categories/install-smart-categories.service';
import { SmartCategoryStageStrategy } from '../services/smart-categories/smart-category-stage.strategy';
import { InstallConstSmartService } from '../const/install-const-smart.service';
import { InstallPresentationSmartUseCase } from './install-presentation-smart.use-case';

/**
 * Установка const-смарта «Презентации» (тип + воронка/стадии + поля).
 *
 * Slim-модуль без контроллеров, зеркало ZprSmartInstallModule:
 * переиспользуется админкой — SmartModule apps/admin импортирует его и
 * отдаёт use-case в ConstSmartInstallerResolver (kind 'presentation').
 * Категорийный сервис и стратегия предоставляются здесь же, чтобы не тянуть
 * весь PbxSmartInstallModule с его контроллерами в чужое приложение.
 */
@Module({
    imports: [
        PBXModule,
        // PortalOnlineCacheService — сброс portal_${domain} после установки.
        PortalStoreModule,
        PortalSmartModule,
        PbxPresentationSmartModule,
        InstallCategoryModule,
        InstallStageModule,
    ],
    providers: [
        InstallPresentationSmartUseCase,
        // Общий движок установки const-смартов (тот же, что у ЗПР).
        InstallConstSmartService,
        InstallSmartCategoriesService,
        SmartCategoryStageStrategy,
    ],
    exports: [InstallPresentationSmartUseCase],
})
export class PresentationSmartInstallModule {}
