import { Module } from '@nestjs/common';
import { InnerDealService } from './services/inner-deal.service';
import { InnerDealPrismaRepository } from './repositories/inner-deal.prisma.repository';
import { InnerDealRepository } from './repositories/inner-deal.repository';
import { InnerDealController } from './controllers/inner-deal.controller';

@Module({
    controllers: [InnerDealController],
    providers: [
        InnerDealService,
        {
            provide: InnerDealRepository,
            useClass: InnerDealPrismaRepository,
        },
    ],
    exports: [InnerDealService],
})
export class InnerDealModule {}
