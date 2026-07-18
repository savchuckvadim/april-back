import { Module } from '@nestjs/common';
import { ProviderService } from './provider.service';
import { ProviderRepository } from './provider.repository';
import { ProviderPrismaRepository } from './provider.prisma.repository';
import { ProviderController } from './provider.controller';

/**
 * Сервисный модуль поставщиков: провайдеры + целевой ProviderController.
 * Админ-контроллер вынесен в {@link ProviderAdminModule}, чтобы приложения
 * (konstructor), импортящие модуль ради ProviderService, не тащили админ-роуты.
 */
@Module({
    controllers: [ProviderController],
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
