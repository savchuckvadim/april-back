import { Module } from '@nestjs/common';
import { PrismaModule } from '@lib/core/prisma/prisma.module';
import { PortalKeysService } from '@lib/portal-lib/store/keys/portal-keys.service';
import { PortalKeyCryptoService } from '@lib/portal-lib/store/keys/portal-key-crypto.service';
import { PortalRepository } from '@lib/portal-lib/store/portal.repository';
import { PortalPrismaRepository } from '@lib/portal-lib/store/portal.prisma.repository';
import { FrontPortalController } from './controllers/front-portal.controller';
import { FrontPortalBuilderService } from './services/front-portal-builder.service';
import { BackendPortalBuilderService } from './services/backend-portal-builder.service';
import { PortalAggregateRepository } from './repositories/portal-aggregate.repository';
import { PortalAggregatePrismaRepository } from './repositories/portal-aggregate.prisma.repository';

/**
 * Локальная сборка моделей Portal из БД (задел для отказа от внешнего
 * Laravel-эндпоинта). Контроллер front/portal раздаёт модель фронту;
 * builder-сервисы экспортируются для будущих потребителей.
 *
 * Провайдеры ключей (PortalKeysService и зависимости) регистрируем локально,
 * а не через PortalStoreModule — чтобы не тащить в приложение его контроллеры
 * и HTTP-клиенты online.
 */
@Module({
    imports: [PrismaModule],
    controllers: [FrontPortalController],
    providers: [
        {
            provide: PortalAggregateRepository,
            useClass: PortalAggregatePrismaRepository,
        },
        { provide: PortalRepository, useClass: PortalPrismaRepository },
        PortalKeyCryptoService,
        PortalKeysService,
        FrontPortalBuilderService,
        BackendPortalBuilderService,
    ],
    exports: [FrontPortalBuilderService, BackendPortalBuilderService],
})
export class PortalBuilderModule {}
