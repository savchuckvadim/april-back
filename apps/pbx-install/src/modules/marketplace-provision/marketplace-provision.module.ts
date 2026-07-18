import { Module } from '@nestjs/common';
import { QueueModule } from '@lib/queue';
import { MarketplaceCoreModule } from '@lib/marketplace-core';
import { PbxSmartInstallModule } from '../smart/pbx-smart-install.module';
import { PbxDealInstallModule } from '../deal/pbx-deal-install.module';
import { PbxCompanyInstallModule } from '../company/pbx-company-install.module';
import { PbxContactInstallModule } from '../contact/pbx-contact-install.module';
import { PbxLeadInstallModule } from '../lead/pbx-lead-install.module';
import { PbxUserInstallModule } from '../user/pbx-user-install.module';
import { PbxTaskInstallModule } from '../task/pbx-task-install.module';
import { PbxListInstallModule } from '../list/pbx-list-install.module';
import { PbxGroupInstallModule } from '../group/pbx-group-install.module';
import { PbxRqInstallModule } from '../rq/pbx-rq-install.module';
import { PbxPortalMeasureModule } from '../konstructor/portal-measure/pbx-portal-measure.module';
import { MarketplaceProvisionProcessor } from './marketplace-provision.processor';
import { ProvisionProductUseCase } from './use-cases/provision-product.use-case';
import { ProvisionStepExecutor } from './services/provision-step.executor';

/**
 * Модуль-воркер provisioning pbx-сущностей маркетплейс-продукта.
 *
 * Слушает очередь marketplace-provision (задания ставит apps/pbx marketplace
 * при approve/повторной установке) и последовательно устанавливает состав
 * продукта из манифеста через существующие install-use-case-ы модулей
 * сущностей. Статусы — в marketplace_install_components / marketplace_installs
 * (через @lib/marketplace-core).
 */
@Module({
    imports: [
        QueueModule,
        MarketplaceCoreModule,
        PbxSmartInstallModule,
        PbxDealInstallModule,
        PbxCompanyInstallModule,
        PbxContactInstallModule,
        PbxLeadInstallModule,
        PbxUserInstallModule,
        PbxTaskInstallModule,
        PbxListInstallModule,
        PbxGroupInstallModule,
        PbxRqInstallModule,
        PbxPortalMeasureModule,
    ],
    providers: [
        MarketplaceProvisionProcessor,
        ProvisionProductUseCase,
        ProvisionStepExecutor,
    ],
})
export class MarketplaceProvisionModule {}
