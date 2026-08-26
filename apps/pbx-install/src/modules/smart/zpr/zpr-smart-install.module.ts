import { Module } from '@nestjs/common';
import { PBXModule } from '@/modules/pbx';
import { PortalStoreModule } from '@lib/portal-lib/store';
import { PortalSmartModule } from '@lib/portal-lib/pbx-domain/portal-smart';
import { PbxZprSmartModule } from '@lib/portal-lib/pbx/pbx-zpr-smart';
import { InstallCategoryModule } from '@app/pbx-install/category/install-category.module';
import { InstallStageModule } from '@app/pbx-install/stage/install-stage.module';
import { InstallSmartCategoriesService } from '../services/smart-categories/install-smart-categories.service';
import { SmartCategoryStageStrategy } from '../services/smart-categories/smart-category-stage.strategy';
import { InstallConstSmartService } from '../const/install-const-smart.service';
import { InstallZprSmartUseCase } from './install-zpr-smart.use-case';

/**
 * Установка const-смарта «Звонки По решению» (тип + воронка/стадии + поля).
 *
 * Отдельный slim-модуль (без контроллеров): переиспользуется админкой —
 * SmartModule apps/admin импортирует его по образцу @app/konstructor и
 * отдаёт use-case в ConstSmartInstallerResolver (kind 'zpr'). Категорийный
 * сервис и стратегия предоставляются здесь же, чтобы не тянуть весь
 * PbxSmartInstallModule с его контроллерами в чужое приложение.
 */
@Module({
    imports: [
        PBXModule,
        // PortalOnlineCacheService — сброс portal_${domain} после установки.
        PortalStoreModule,
        PortalSmartModule,
        PbxZprSmartModule,
        InstallCategoryModule,
        InstallStageModule,
    ],
    providers: [
        InstallZprSmartUseCase,
        // Общий движок установки const-смартов (тип/поля/воронка/зеркала).
        InstallConstSmartService,
        InstallSmartCategoriesService,
        SmartCategoryStageStrategy,
    ],
    exports: [InstallZprSmartUseCase],
})
export class ZprSmartInstallModule {}
