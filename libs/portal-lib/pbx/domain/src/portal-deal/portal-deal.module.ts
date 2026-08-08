import { Module } from '@nestjs/common';
import { PbxFieldModule } from '@lib/portal-lib/pbx-domain/field/pbx-field.module';
import { PortalDealService } from './services/portal-deal.service';
import { PortalDealRepository } from './repositories/portal-deal.repository';
import { PortalDealPrismaRepository } from './repositories/portal-deal.prisma.repository';

@Module({
    imports: [PbxFieldModule],
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
