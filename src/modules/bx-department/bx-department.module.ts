import { Module } from '@nestjs/common';
import { DepartmentController } from './bx-department.controller';
import { BxDepartmentService } from './services/bx-department.service';
import { RedisModule } from 'src/core/redis/redis.module';
import { PBXModule } from '../pbx';
import { BxAllDepartmentsService } from './services/bx-all-departments.service';
import { DepartmentEndpointController } from './department.controller';

@Module({
    imports: [PBXModule, RedisModule],
    controllers: [DepartmentController, DepartmentEndpointController],
    providers: [BxDepartmentService, BxAllDepartmentsService],
    exports: [BxDepartmentService],
})
export class BxDepartmentModule {}
