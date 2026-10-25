import { Module } from '@nestjs/common';
import { BxDepartmentModule } from '@lib/bx-department/bx-department.module';
import { InnerDealService } from './services/inner-deal.service';
import { InnerDealLibraryService } from './services/inner-deal-library.service';
import { InnerDealPrismaRepository } from './repositories/inner-deal.prisma.repository';
import { InnerDealRepository } from './repositories/inner-deal.repository';
import { InnerDealController } from './controllers/inner-deal.controller';
import { InnerDealLibraryController } from './controllers/inner-deal-library.controller';

@Module({
    // структура отделов продаж — роли для библиотеки избранного/акций
    imports: [BxDepartmentModule],
    controllers: [InnerDealController, InnerDealLibraryController],
    providers: [
        InnerDealService,
        InnerDealLibraryService,
        {
            provide: InnerDealRepository,
            useClass: InnerDealPrismaRepository,
        },
    ],
    exports: [InnerDealService, InnerDealLibraryService],
})
export class InnerDealModule {}
