import { Module } from '@nestjs/common';
import { PbxCompanyInstallModule } from './company/pbx-company-install.module';
import { PbxContactInstallModule } from './contact/pbx-contact-install.module';
import { PbxDealInstallModule } from './deal/pbx-deal-install.module';
import { PbxLeadInstallModule } from './lead/pbx-lead-install.module';
import { PbxSmartInstallModule } from './smart/pbx-smart-install.module';
import { PbxRpaInstallModule } from './rpa/pbx-rpa-install.module';
import { PbxListInstallModule } from './list/pbx-list-install.module';
import { PbxGroupInstallModule } from './group/pbx-group-install.module';
import { PbxDepartamentInstallModule } from './department/pbx-departament-install.module';
import { PbxRqInstallModule } from './rq/pbx-rq-install.module';
import { PbxTaskInstallModule } from './task/pbx-task-install.module';
import { PbxUserInstallModule } from './user/pbx-user-install.module';
import { PortalStoreModule } from '@lib/portal-lib';
import { ProviderModule } from '@lib/portal-lib/konstructor';
import { PbxPortalMeasureModule } from './konstructor/portal-measure/pbx-portal-measure.module';
import { PbxPortalContractModule } from './konstructor/portal-contract/pbx-portal-contract.module';
import { PbxMeasureModule } from './konstructor/measure/pbx-measure.module';
import { PbxContractModule } from './konstructor/contract/pbx-contract.module';
import { PbxTemplateBaseModule } from './konstructor/template-base/pbx-template-base.module';
import { PbxFieldModule } from './konstructor/field/pbx-field.module';
import { PbxCounterModule } from './konstructor/counter/pbx-counter.module';
import { DocumentCounterModule } from '@lib/portal-lib/konstructor';
import { MarketplaceProvisionModule } from './marketplace-provision/marketplace-provision.module';

@Module({
    imports: [
        MarketplaceProvisionModule,
        PbxSmartInstallModule,
        PbxRpaInstallModule,
        PbxCompanyInstallModule,
        PbxContactInstallModule,
        PbxDealInstallModule,
        PbxLeadInstallModule,
        PbxListInstallModule,
        PbxGroupInstallModule,
        PbxDepartamentInstallModule,
        PbxRqInstallModule,
        PbxTaskInstallModule,
        PbxUserInstallModule,
        PortalStoreModule,
        ProviderModule,
        PbxPortalMeasureModule,
        PbxPortalContractModule,
        PbxMeasureModule,
        PbxContractModule,
        PbxTemplateBaseModule,
        PbxFieldModule,
        PbxCounterModule,
        DocumentCounterModule,
    ],
    exports: [
        PbxSmartInstallModule,
        PbxRpaInstallModule,
        PbxCompanyInstallModule,
        PbxContactInstallModule,
        PbxDealInstallModule,
        PbxLeadInstallModule,
        PbxListInstallModule,
        PbxGroupInstallModule,
        PbxDepartamentInstallModule,
        PbxRqInstallModule,
        PbxTaskInstallModule,
        PbxUserInstallModule,
        ProviderModule,
        PbxPortalMeasureModule,
        PbxPortalContractModule,
        PbxMeasureModule,
        PbxContractModule,
        PbxTemplateBaseModule,
        PbxFieldModule,
        PbxCounterModule,
        DocumentCounterModule,
    ],
})
export class PBXInstallModule {}
