import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core/prisma/prisma.module';
import { BtxDealService } from './services/btx-deal.service';
import { BtxDealRepository } from './repositories/btx-deal.repository';
import { BtxDealPrismaRepository } from './repositories/btx-deal.prisma.repository';
import { BtxDealController } from './controllers/btx-deal.controller';

@Module({
    imports: [PrismaModule],
    providers: [
        BtxDealService,
        {
            provide: BtxDealRepository,
            useClass: BtxDealPrismaRepository,
        },
    ],
    controllers: [BtxDealController],
    exports: [BtxDealService, BtxDealRepository],
})
export class BtxDealModule { }

