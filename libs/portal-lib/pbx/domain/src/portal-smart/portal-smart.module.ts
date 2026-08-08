import { Module } from '@nestjs/common';
import { PortalKonstructorModule } from '@lib/portal-lib/konstructor/portal-konstructor.module';
import { PortalCategoryModule } from '@lib/portal-lib/pbx-domain/category/category.module';
import { PbxFieldModule } from '@lib/portal-lib/pbx-domain/field/pbx-field.module';
import { PortalSmartService } from './portal-smart.service';

/**
 * Сервисный модуль смарт-процессов PortalDB. Контроллер вынесен в
 * {@link PortalSmartAdminModule} — см. ai/rules/app-api-surface.md.
 */
@Module({
    imports: [PortalKonstructorModule, PortalCategoryModule, PbxFieldModule],
    providers: [PortalSmartService],
    exports: [PortalSmartService],
})
export class PortalSmartModule {}
