import { Module } from '@nestjs/common';
import { PortalKonstructorModule } from '@/modules/portal-konstructor/portal-konstructor.module';
import { PortalCategoryModule } from '@/modules/pbx-domain/category/category.module';
import { PbxFieldModule } from '@/modules/pbx-domain/field/pbx-field.module';
import { PortalSmartService } from './portal-smart.service';
import { PortalSmartController } from './controllers/portal-smart.controller';

@Module({
    imports: [PortalKonstructorModule, PortalCategoryModule, PbxFieldModule],
    controllers: [PortalSmartController],
    providers: [PortalSmartService],
    exports: [PortalSmartService],
})
export class PortalSmartModule {}
