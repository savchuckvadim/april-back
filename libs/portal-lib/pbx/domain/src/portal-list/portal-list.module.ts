import { Module } from '@nestjs/common';
import { PbxFieldModule } from '@lib/portal-lib/pbx-domain/field/pbx-field.module';
import { PortalStoreModule } from '@lib/portal-lib/store/portal-store.module';
import { PortalListService } from './portal-list.service';

@Module({
    imports: [PbxFieldModule, PortalStoreModule],
    providers: [PortalListService],
    exports: [PortalListService],
})
export class PortalListModule {}
