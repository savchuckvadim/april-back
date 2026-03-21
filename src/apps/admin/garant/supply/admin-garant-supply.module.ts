import { SupplyModule, SupplyService } from '@/modules/garant/supply';
import { SupplyExcelService } from '@/modules/garant/supply/services/supply-excel.service';
import { Module } from '@nestjs/common';
import { AdminGarantSupplyController } from './controllers/admin-garant-supply.controller';
import { SupplyRepository } from '@/modules/garant/supply/supply.repository';
import { SupplyPrismaRepository } from '@/modules/garant/supply/supply.prisma.repository';

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
