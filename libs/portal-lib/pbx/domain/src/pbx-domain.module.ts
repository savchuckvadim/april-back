import { Module } from '@nestjs/common';
import { PbxFieldModule } from './field/pbx-field.module';
import { PbxUserModule } from './user/pbx-user.module';
import { PortalCategoryModule } from './category/category.module';
import { PortalStageModule } from './stage/stage.module';
import { PortalSmartModule } from './portal-smart/portal-smart.module';
import { PortalRpaModule } from './portal-rpa/portal-rpa.module';
import { PortalCompanyModule } from './portal-company/portal-company.module';
import { PortalContactModule } from './portal-contact/portal-contact.module';
import { PortalDealModule } from './portal-deal/portal-deal.module';
import { PortalLeadModule } from './portal-lead/portal-lead.module';
import { PortalCallingModule } from './portal-calling/portal-calling.module';
import { PortalRqModule } from './portal-rq/portal-rq.module';

@Module({
    imports: [
        PbxFieldModule,
        PbxUserModule,
        PortalCategoryModule,
        PortalStageModule,
        PortalSmartModule,
        PortalRpaModule,
        PortalCompanyModule,
        PortalContactModule,
        PortalDealModule,
        PortalLeadModule,
        PortalCallingModule,
        PortalRqModule,
    ],
    exports: [
        PbxFieldModule,
        PbxUserModule,
        PortalCategoryModule,
        PortalStageModule,
        PortalSmartModule,
        PortalRpaModule,
        PortalCompanyModule,
        PortalContactModule,
        PortalDealModule,
        PortalLeadModule,
        PortalCallingModule,
        PortalRqModule,
    ],
})
export class PbxDomainModule {}
