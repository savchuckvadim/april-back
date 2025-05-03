import { Module } from '@nestjs/common';
import { DepartmentController } from './department.controller';
import { DepartmentResolverService } from './services/department-resolver-bitrxi.service';
import { RedisModule } from 'src/core/redis/redis.module';
import { PortalModule } from 'src/modules/portal/portal.module';
import { BitrixCoreModule } from '../../core/bitrix-core.module';
import { DepartmentBitrixService } from '../../domain/department/services/department-bitrxi.service';
// import { BitrixContextService } from '../../services/bitrix-context.service';
// ..C:\Projects\April-KP\april-next\back\src\modules\bitrix\endpoints\department\department.module.ts
@Module({
    imports: [
        PortalModule,
        RedisModule,
        BitrixCoreModule
    ],
    controllers: [
        DepartmentController
    ],
    providers: [
        DepartmentResolverService,
        DepartmentBitrixService,
        // BitrixApiService, //new
        // BitrixContextService

    ],
    exports: [
        DepartmentResolverService
    ],

})
export class BitrixDepartmentEndpointModule { }
