import { Module } from '@nestjs/common';
import { PbxFieldModule } from './field/pbx-field.module';
import { PbxUserModule } from './user/pbx-user.module';
import { PortalCategoryModule } from './category/category.module';
import { PortalStageModule } from './stage/stage.module';
import { PortalSmartModule } from './portal-smart/portal-smart.module';
import { PortalCompanyModule } from './portal-company/portal-company.module';

@Module({
    imports: [
        PbxFieldModule,
        PbxUserModule,
        PortalCategoryModule,
        PortalStageModule,
        PortalSmartModule,
        PortalCompanyModule,
    ],
    exports: [
        PbxFieldModule,
        PbxUserModule,
        PortalCategoryModule,
        PortalStageModule,
        PortalSmartModule,
        PortalCompanyModule,
    ],
})
export class PbxDomainModule {}
