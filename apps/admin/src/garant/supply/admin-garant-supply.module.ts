import { SupplyModule, SupplyService } from '@lib/garant/supply';
import { Module } from '@nestjs/common';
import { AdminGarantSupplyController } from './controllers/admin-garant-supply.controller';
import { SupplyRepository } from '@lib/garant/supply/supply.repository';
import { SupplyPrismaRepository } from '@lib/garant/supply/supply.prisma.repository';

@Module({
    imports: [SupplyModule],
    controllers: [AdminGarantSupplyController],
    providers: [
        SupplyService,
        {
            provide: SupplyRepository,
            useClass: SupplyPrismaRepository,
        },
    ],
})
export class AdminGarantSupplyModule {}
