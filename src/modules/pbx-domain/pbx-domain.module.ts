import { Module } from '@nestjs/common';
import { PbxFieldModule } from './field/pbx-field.module';
import { PbxUserModule } from './user/pbx-user.module';
import { PortalCategoryModule } from './category/category.module';
import { PortalStageModule } from './stage/stage.module';
import { PortalSmartModule } from './portal-smart/portal-smart.module';
import { PortalCompanyModule } from './portal-company/portal-company.module';
import { PortalDealModule } from './portal-deal/portal-deal.module';

@Module({
    imports: [
        PbxFieldModule,
        PbxUserModule,
        PortalCategoryModule,
        PortalStageModule,
        PortalSmartModule,
        PortalCompanyModule,
        PortalDealModule,
    ],
    exports: [
        PbxFieldModule,
        PbxUserModule,
        PortalCategoryModule,
        PortalStageModule,
        PortalSmartModule,
        PortalCompanyModule,
        PortalDealModule,
    ],
})
export class PbxDomainModule {}
