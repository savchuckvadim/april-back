import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core/prisma/prisma.module';
import { PortalAppSettingsModule } from '@lib/portal-lib/store/app-settings/portal-app-settings.module';
import {
    PortalCategoryModule,
    PortalCompanyModule,
    PortalDealModule,
    PortalLeadModule,
} from '@lib/portal-lib/pbx-domain';
import { HooksAdminController } from './hooks-admin.controller';
import { HookReadinessService } from '../readiness/hook-readiness.service';
import { HookOperationsService } from '../monitoring/hook-operations.service';

/**
 * Админ-слой каталога хуков: `admin/hooks*` и `admin/portal/:id/hooks*`.
 * Подключать только в приложении админки — прикладным приложениям нужен
 * сам каталог (чистые функции), а не роуты в их Swagger
 * (ai/rules/app-api-surface.md).
 */
@Module({
    imports: [
        PrismaModule,
        PortalAppSettingsModule,
        PortalLeadModule,
        PortalDealModule,
        PortalCompanyModule,
        PortalCategoryModule,
    ],
    controllers: [HooksAdminController],
    providers: [HookReadinessService, HookOperationsService],
})
export class HooksAdminModule {}
