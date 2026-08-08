import { Module } from '@nestjs/common';
import { ProviderService } from './provider.service';
import { ProviderRepository } from './provider.repository';
import { ProviderPrismaRepository } from './provider.prisma.repository';

/**
 * Сервисный модуль поставщиков — БЕЗ контроллеров.
 * Публичные роуты — {@link ProviderPublicModule} (подключает konstructor),
 * админские — {@link ProviderAdminModule} (подключает админка).
 * См. ai/rules/app-api-surface.md.
 */
@Module({
    providers: [
        ProviderService,
        {
            provide: ProviderRepository,
            useClass: ProviderPrismaRepository,
        },
    ],
    exports: [ProviderService],
})
export class ProviderModule {}
