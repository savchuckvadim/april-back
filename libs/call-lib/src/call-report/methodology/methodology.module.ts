import { Module } from '@nestjs/common';
import { PrismaModule } from '@lib/core/prisma/prisma.module';
import { PortalStoreModule } from '@lib/portal-lib/store/portal-store.module';
import { MethodologyRegistryService } from './methodology-registry.service';
import { MethodologyPrismaRepository } from './methodology.prisma.repository';
import { MethodologyRepository } from './methodology.repository';

/**
 * Методики продаж как конфиг: реестр действующей методики портала (настройка
 * AI портала → таблица `ai_methodologies` → встроенные конфиги). Без
 * контроллеров — их подключает админ-модуль в apps/admin
 * (ai/rules/app-api-surface.md). Импортируется конвейером разбора
 * (call-report в event-sales) и Agent API (agent-gate).
 */
@Module({
    imports: [PrismaModule, PortalStoreModule],
    providers: [
        MethodologyRegistryService,
        {
            provide: MethodologyRepository,
            useClass: MethodologyPrismaRepository,
        },
    ],
    exports: [MethodologyRegistryService, MethodologyRepository],
})
export class MethodologyModule {}
