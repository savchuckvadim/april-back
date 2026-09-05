import { Module } from '@nestjs/common';
import { DepartmentController } from './controllers/bx-department.controller';
import { BxDepartmentService } from './services/bx-department.service';
import { RedisModule } from 'src/core/redis/redis.module';
import { PBXModule } from '@/modules/pbx';
import { BitrixV3Module } from '@lib/bitrix-v3';
import { PortalAppSettingsModule } from '@lib/portal-lib/store/app-settings/portal-app-settings.module';
import { BxAllDepartmentsService } from './services/bx-all-departments.service';
import { DepartmentEndpointController } from './controllers/department.controller';
import { BxTeamController } from './controllers/bx-team.controller';
import { BxTeamService } from './services/bx-team.service';
import { BxDepartmentStructureController } from './controllers/bx-department-structure.controller';
import { BxDepartmentStructureService } from './services/bx-department-structure.service';
import { BxDepartmentCacheController } from './controllers/bx-department-cache.controller';
import { BxDepartmentCacheService } from './services/bx-department-cache.service';
import { BxDepartmentHeadsService } from './services/bx-department-heads.service';

@Module({
    imports: [PBXModule, RedisModule, BitrixV3Module, PortalAppSettingsModule],
    controllers: [
        DepartmentController,
        DepartmentEndpointController,
        BxTeamController,
        BxDepartmentStructureController,
        BxDepartmentCacheController,
    ],
    providers: [
        BxDepartmentHeadsService,
        BxDepartmentService,
        BxAllDepartmentsService,
        BxTeamService,
        BxDepartmentStructureService,
        BxDepartmentCacheService,
    ],
    exports: [
        BxDepartmentHeadsService,
        BxDepartmentService,
        BxTeamService,
        BxDepartmentStructureService,
        BxDepartmentCacheService,
    ],
})
export class BxDepartmentModule {}
