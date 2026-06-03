import {
    RegionExcelService,
    RegionModule,
    RegionService,
} from '@/modules/garant';
import { Module } from '@nestjs/common';
import { AdminGarantRegionController } from './controllers/admin-garant-region.controller';
import { RegionRepository } from '@/modules/garant/region/region.repository';
import { RegionPrismaRepository } from '@/modules/garant/region/region.prisma.repository';
import { PortalRegionService } from './services/portal-region.service';
import { AdminPortalGarantRegionController } from './controllers/admin-portal-garant-region.controller';
import { PortalStoreModule } from '@/modules/portal-konstructor/portal/portal-store.module';

@Module({
    imports: [RegionModule, PortalStoreModule],
    controllers: [
        AdminGarantRegionController,
        AdminPortalGarantRegionController,
    ],
    providers: [
        RegionService,
        PortalRegionService,
        {
            provide: RegionRepository,
            useClass: RegionPrismaRepository,
        },
        RegionExcelService,
    ],
})
export class AdminGarantRegionModule {}
