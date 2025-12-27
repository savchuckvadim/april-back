import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core/prisma/prisma.module';
import { MeasureService } from './services/measure.service';
import { MeasureRepository } from './repositories/measure.repository';
import { MeasurePrismaRepository } from './repositories/measure.prisma.repository';
import { MeasureController } from './controllers/measure.controller';

@Module({
    imports: [PrismaModule],
    providers: [
        MeasureService,
        {
            provide: MeasureRepository,
            useClass: MeasurePrismaRepository,
        },
    ],
    controllers: [MeasureController],
    exports: [MeasureService, MeasureRepository],
})
export class MeasureModule {}

