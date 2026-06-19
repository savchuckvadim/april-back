import { Module } from '@nestjs/common';
import { MeasureService } from './measure.service';
import { MeasureRepository } from './measure.repository';
import { MeasurePrismaRepository } from './measure.prisma.repository';

@Module({
    providers: [
        MeasureService,
        {
            provide: MeasureRepository,
            useClass: MeasurePrismaRepository,
        },
    ],
    exports: [MeasureService, MeasureRepository],
})
export class MeasureModule {}
