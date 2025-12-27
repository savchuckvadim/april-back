import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core/prisma/prisma.module';
import { BtxCategoryService } from './services/btx-category.service';
import { BtxCategoryRepository } from './repositories/btx-category.repository';
import { BtxCategoryPrismaRepository } from './repositories/btx-category.prisma.repository';
import { BtxStageRepository } from './repositories/btx-stage.repository';
import { BtxStagePrismaRepository } from './repositories/btx-stage.prisma.repository';
import { BtxCategoryController } from './controllers/btx-category.controller';

@Module({
    imports: [PrismaModule],
    providers: [
        BtxCategoryService,
        {
            provide: BtxCategoryRepository,
            useClass: BtxCategoryPrismaRepository,
        },
        {
            provide: BtxStageRepository,
            useClass: BtxStagePrismaRepository,
        },
    ],
    controllers: [BtxCategoryController],
    exports: [BtxCategoryService, BtxCategoryRepository, BtxStageRepository],
})
export class BtxCategoryModule {}

