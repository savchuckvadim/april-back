import { GarantModule } from '@lib/garant/garant.module';
import { Module } from '@nestjs/common';
import { PortalSessionModule } from '@lib/auth';
import { KonstructorInitUseCase } from './konstructor-init.use-case';
import { InitRegionService } from './services/init.region.service';
import { KonstructorInitController } from './konstructor-init.controller';
import { InitComplectService } from './services/init-complect.service';
import { InitInfoblockService } from './services/init-infoblock.service';
import { InitServicesService } from './services/init-services.service';
import { PortalKonstructorModule } from '@lib/portal-lib/konstructor/portal-konstructor.module';

@Module({
    // PortalSessionModule — guard сессии портала на выдаче каталога
    imports: [GarantModule, PortalKonstructorModule, PortalSessionModule],
    controllers: [KonstructorInitController],
    providers: [
        KonstructorInitUseCase,
        InitRegionService,
        InitComplectService,
        InitInfoblockService,
        InitServicesService,
    ],
    exports: [KonstructorInitUseCase],
})
export class KonstructorInitModule {}
