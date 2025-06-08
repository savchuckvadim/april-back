import { Module } from '@nestjs/common';
import { BitrixCoreModule } from '../../core/bitrix-core.module';
import { BitrixActivityCreateService } from './services/activity-create.service';
import { PortalModule } from 'src/modules/portal/portal.module';

@Module({
    imports: [
        BitrixCoreModule,
        PortalModule,
    ],
    providers: [
        // BitrixActivityCreateService
    ],
    exports: [
        // BitrixActivityCreateService
    ]
})
export class BitrixActivityDomainModule { }
