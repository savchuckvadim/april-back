import { GarantModule } from '@/modules/garant/garant.module';
import { Module } from '@nestjs/common';
import { KonstructorInitUseCase } from './konstructor-init.use-case';
import { InitRegionService } from './services/init.region.service';
import { KonstructorInitController } from './konstructor-init.controller';
import { InitComplectService } from './services/init-complect.service';
import { InitInfoblockService } from './services/init-infoblock.service';

@Module({
    imports: [GarantModule],
    controllers: [KonstructorInitController],
    providers: [
        KonstructorInitUseCase,
        InitRegionService,
        InitComplectService,
        InitInfoblockService,
    ],
})
export class KonstructorInitModule {}
