import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core/prisma/prisma.module';
import { PortalStageModule } from '@lib/portal-lib/pbx-domain/stage';
import { BtxCategoryService } from './services/btx-category.service';
import { BtxCategoryRepository } from './repositories/btx-category.repository';
import { BtxCategoryPrismaRepository } from './repositories/btx-category.prisma.repository';

/**
 * Сервисный модуль категорий PortalDB. Контроллер вынесен в
 * {@link PortalCategoryAdminModule} — см. ai/rules/app-api-surface.md.
 */
@Module({
    imports: [PrismaModule, PortalStageModule],
    providers: [
        BtxCategoryService,
        {
            provide: BtxCategoryRepository,
            useClass: BtxCategoryPrismaRepository,
        },
    ],
    exports: [BtxCategoryService, BtxCategoryRepository, PortalStageModule],
})
export class PortalCategoryModule {}
