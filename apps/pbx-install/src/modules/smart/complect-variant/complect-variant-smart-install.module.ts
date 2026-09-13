import { Module } from '@nestjs/common';
import { PBXModule } from '@/modules/pbx';
import { PortalStoreModule } from '@lib/portal-lib/store';
import { PortalSmartModule } from '@lib/portal-lib/pbx-domain/portal-smart';
import { PbxComplectVariantSmartModule } from '@lib/portal-lib/pbx/pbx-complect-variant-smart';
import { InstallCategoryModule } from '@app/pbx-install/category/install-category.module';
import { InstallStageModule } from '@app/pbx-install/stage/install-stage.module';
import { InstallSmartCategoriesService } from '../services/smart-categories/install-smart-categories.service';
import { SmartCategoryStageStrategy } from '../services/smart-categories/smart-category-stage.strategy';
import { InstallConstSmartService } from '../const/install-const-smart.service';
import { InstallComplectVariantSmartUseCase } from './install-complect-variant-smart.use-case';

/**
 * Установка const-смарта «Варианты комплекта» (тип + воронка/стадии + поля).
 * Slim-модуль без контроллеров — зеркало PresentationSmartInstallModule:
 * админка импортирует его и отдаёт use-case в ConstSmartInstallerResolver.
 */
@Module({
    imports: [
        PBXModule,
        PortalStoreModule,
        PortalSmartModule,
        PbxComplectVariantSmartModule,
        InstallCategoryModule,
        InstallStageModule,
    ],
    providers: [
        InstallComplectVariantSmartUseCase,
        InstallConstSmartService,
        InstallSmartCategoriesService,
        SmartCategoryStageStrategy,
    ],
    exports: [InstallComplectVariantSmartUseCase],
})
export class ComplectVariantSmartInstallModule {}
