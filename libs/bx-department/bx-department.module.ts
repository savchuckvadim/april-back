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
import { BxSuperUserService } from './services/bx-super-user.service';
import { VendorSuperUserRepository } from './repositories/vendor-super-user.repository';
import { VendorSuperUserPrismaRepository } from './repositories/vendor-super-user.prisma.repository';

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
        // Суперпользователи вендора живут в БД (vendor_super_users), пишет
        // их админка April. Раньше список приходил из env BX_SUPER_USER_IDS.
        {
            provide: VendorSuperUserRepository,
            useClass: VendorSuperUserPrismaRepository,
        },
        BxSuperUserService,
        BxDepartmentHeadsService,
        BxDepartmentService,
        BxAllDepartmentsService,
        BxTeamService,
        BxDepartmentStructureService,
        BxDepartmentCacheService,
    ],
    exports: [
        BxSuperUserService,
        VendorSuperUserRepository,
        BxDepartmentHeadsService,
        BxDepartmentService,
        BxTeamService,
        BxDepartmentStructureService,
        BxDepartmentCacheService,
    ],
})
export class BxDepartmentModule {}
