import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core/prisma/prisma.module';
import { PortalStageModule } from '@/modules/pbx-domain/stage';
import { BtxCategoryService } from './services/btx-category.service';
import { BtxCategoryRepository } from './repositories/btx-category.repository';
import { BtxCategoryPrismaRepository } from './repositories/btx-category.prisma.repository';
import { PortalCategoryAdminController } from './controllers/portal-category.admin.controller';

@Module({
    imports: [PrismaModule, PortalStageModule],
    providers: [
        BtxCategoryService,
        {
            provide: BtxCategoryRepository,
            useClass: BtxCategoryPrismaRepository,
        },
    ],
    controllers: [PortalCategoryAdminController],
    exports: [BtxCategoryService, BtxCategoryRepository, PortalStageModule],
})
export class PortalCategoryModule {}
