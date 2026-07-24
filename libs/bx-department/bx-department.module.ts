import { Module } from '@nestjs/common';
import { DepartmentController } from './controllers/bx-department.controller';
import { BxDepartmentService } from './services/bx-department.service';
import { RedisModule } from 'src/core/redis/redis.module';
import { PBXModule } from '@/modules/pbx';
import { BitrixV3Module } from '@lib/bitrix-v3';
import { BxAllDepartmentsService } from './services/bx-all-departments.service';
import { DepartmentEndpointController } from './controllers/department.controller';
import { BxTeamController } from './controllers/bx-team.controller';
import { BxTeamService } from './services/bx-team.service';
import { BxDepartmentStructureController } from './controllers/bx-department-structure.controller';
import { BxDepartmentStructureService } from './services/bx-department-structure.service';
import { BxDepartmentCacheController } from './controllers/bx-department-cache.controller';
import { BxDepartmentCacheService } from './services/bx-department-cache.service';

@Module({
    imports: [PBXModule, RedisModule, BitrixV3Module],
    controllers: [
        DepartmentController,
        DepartmentEndpointController,
        BxTeamController,
        BxDepartmentStructureController,
        BxDepartmentCacheController,
    ],
    providers: [
        BxDepartmentService,
        BxAllDepartmentsService,
        BxTeamService,
        BxDepartmentStructureService,
        BxDepartmentCacheService,
    ],
    exports: [
        BxDepartmentService,
        BxTeamService,
        BxDepartmentStructureService,
        BxDepartmentCacheService,
    ],
})
export class BxDepartmentModule {}
