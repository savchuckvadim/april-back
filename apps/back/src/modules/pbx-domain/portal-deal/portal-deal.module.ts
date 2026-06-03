import { Module } from '@nestjs/common';
import { PbxFieldModule } from '@/modules/pbx-domain/field/pbx-field.module';
import { PortalDealService } from './services/portal-deal.service';
import { PortalDealController } from './controllers/portal-deal.controller';
import { PortalDealFieldController } from './controllers/portal-deal-field.controller';
import { PortalDealRepository } from './repositories/portal-deal.repository';
import { PortalDealPrismaRepository } from './repositories/portal-deal.prisma.repository';

@Module({
    imports: [PbxFieldModule],
    controllers: [PortalDealController, PortalDealFieldController],
    providers: [
        PortalDealService,
        {
            provide: PortalDealRepository,
            useClass: PortalDealPrismaRepository,
        },
    ],
    exports: [PortalDealService],
})
export class PortalDealModule {}
