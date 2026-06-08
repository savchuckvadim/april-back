import { SupplyModule, SupplyService } from '@lib/garant/supply';
import { SupplyExcelService } from '@lib/garant/supply/services/supply-excel.service';
import { Module } from '@nestjs/common';
import { AdminGarantSupplyController } from './controllers/admin-garant-supply.controller';
import { SupplyRepository } from '@lib/garant/supply/supply.repository';
import { SupplyPrismaRepository } from '@lib/garant/supply/supply.prisma.repository';

@Module({
    imports: [SupplyModule],
    controllers: [AdminGarantSupplyController],
    providers: [
        SupplyService,
        SupplyExcelService,
        {
            provide: SupplyRepository,
            useClass: SupplyPrismaRepository,
        },
    ],
})
export class AdminGarantSupplyModule {}
