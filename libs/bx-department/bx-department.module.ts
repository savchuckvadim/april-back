import { Module } from '@nestjs/common';
import { DepartmentController } from './bx-department.controller';
import { BxDepartmentService } from './services/bx-department.service';
import { RedisModule } from 'src/core/redis/redis.module';
import { PBXModule } from '@/modules/pbx';
import { BitrixV3Module } from '@lib/bitrix-v3';
import { BxAllDepartmentsService } from './services/bx-all-departments.service';
import { DepartmentEndpointController } from './department.controller';
import { BxTeamController } from './bx-team.controller';
import { BxTeamService } from './services/bx-team.service';
import { BxDepartmentStructureController } from './bx-department-structure.controller';
import { BxDepartmentStructureService } from './services/bx-department-structure.service';

@Module({
    imports: [PBXModule, RedisModule, BitrixV3Module],
    controllers: [
        DepartmentController,
        DepartmentEndpointController,
        BxTeamController,
        BxDepartmentStructureController,
    ],
    providers: [
        BxDepartmentService,
        BxAllDepartmentsService,
        BxTeamService,
        BxDepartmentStructureService,
    ],
    exports: [BxDepartmentService, BxTeamService, BxDepartmentStructureService],
})
export class BxDepartmentModule {}
