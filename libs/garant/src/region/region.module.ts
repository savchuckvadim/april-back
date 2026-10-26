import { Module } from '@nestjs/common';
import { RegionPrismaRepository } from './region.prisma.repository';
import { RegionService } from './region.service';
import { RegionRepository } from './region.repository';
import { RegionController } from './region.controller';
import { StorageModule } from 'src/core/storage/storage.module';
import { PortalRegionService } from './portal-region/portal-region.service';
import { PortalRegionController } from './portal-region/portal.region.controller';
import { PortalStoreModule } from '@lib/portal-lib/store/portal-store.module';

@Module({
    imports: [StorageModule, PortalStoreModule],
    controllers: [RegionController, PortalRegionController],
    providers: [
        RegionService,

        PortalRegionService,
        {
            provide: RegionRepository,
            useClass: RegionPrismaRepository,
        },
    ],
    exports: [RegionService],
})
export class RegionModule {}
