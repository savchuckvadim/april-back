import { Module } from '@nestjs/common';
import { PortalKonstructorModule } from '@lib/portal-lib/konstructor/portal-konstructor.module';
import { PortalCategoryModule } from '@lib/portal-lib/pbx-domain/category/category.module';
import { PbxFieldModule } from '@lib/portal-lib/pbx-domain/field/pbx-field.module';
import { PortalRpaService } from './portal-rpa.service';

@Module({
    imports: [PortalKonstructorModule, PortalCategoryModule, PbxFieldModule],
    providers: [PortalRpaService],
    exports: [PortalRpaService],
})
export class PortalRpaModule {}
