import { Module } from '@nestjs/common';
import { PortalKonstructorModule } from '@lib/portal-lib/konstructor/portal-konstructor.module';
import { PortalCategoryModule } from '@lib/portal-lib/pbx-domain/category/category.module';
import { PbxFieldModule } from '@lib/portal-lib/pbx-domain/field/pbx-field.module';
import { PortalSmartService } from './portal-smart.service';
import { PortalSmartController } from './controllers/portal-smart.controller';

@Module({
    imports: [PortalKonstructorModule, PortalCategoryModule, PbxFieldModule],
    controllers: [PortalSmartController],
    providers: [PortalSmartService],
    exports: [PortalSmartService],
})
export class PortalSmartModule {}
