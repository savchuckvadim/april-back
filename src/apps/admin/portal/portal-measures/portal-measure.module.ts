import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core/prisma/prisma.module';
import { PortalMeasureService } from './services/portal-measure.service';
import { PortalMeasureRepository } from './repositories/portal-measure.repository';
import { PortalMeasurePrismaRepository } from './repositories/portal-measure.prisma.repository';
import { PortalMeasureController } from './controllers/portal-measure.controller';

@Module({
    imports: [PrismaModule],
    providers: [
        PortalMeasureService,
        {
            provide: PortalMeasureRepository,
            useClass: PortalMeasurePrismaRepository,
        },
    ],
    controllers: [PortalMeasureController],
    exports: [PortalMeasureService, PortalMeasureRepository],
})
export class PortalMeasureModule {}

