import {
    RegionExcelService,
    RegionModule,
    RegionService,
} from '@lib/garant';
import { Module } from '@nestjs/common';
import { AdminGarantRegionController } from './controllers/admin-garant-region.controller';
import { RegionRepository } from '@lib/garant/region/region.repository';
import { RegionPrismaRepository } from '@lib/garant/region/region.prisma.repository';
import { PortalRegionService } from './services/portal-region.service';
import { AdminPortalGarantRegionController } from './controllers/admin-portal-garant-region.controller';
import { PortalStoreModule } from '@lib/portal-konstructor/portal/portal-store.module';

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
