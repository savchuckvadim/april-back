import { Module } from '@nestjs/common';
import { MeasureModule } from '../measure/measure.module';
import { PortalMeasureService } from './portal-measure.service';
import { PortalMeasureSyncService } from './portal-measure-sync.service';
import { PortalMeasureRepository } from './portal-measure.repository';
import { PortalMeasurePrismaRepository } from './portal-measure.prisma.repository';

@Module({
    imports: [MeasureModule],
    providers: [
        PortalMeasureService,
        PortalMeasureSyncService,
        {
            provide: PortalMeasureRepository,
            useClass: PortalMeasurePrismaRepository,
        },
    ],
    exports: [
        PortalMeasureService,
        PortalMeasureSyncService,
        PortalMeasureRepository,
    ],
})
export class PortalMeasureModule {}
