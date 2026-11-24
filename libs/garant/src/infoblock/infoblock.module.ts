import { Module } from '@nestjs/common';
import { InfoblockPrismaRepository } from './infoblock.prisma.repository';
import { InfoblockService } from './infoblock.service';
import { InfoblockRepository } from './infoblock.repository';

/**
 * Сервисный модуль инфоблоков гаранта: провайдеры и экспорт сервиса, без
 * контроллеров. Контроллер `/infoblock` вынесен в {@link InfoblockAdminModule},
 * чтобы публичное приложение konstructor, импортирующее модуль ради
 * InfoblockService, его не регистрировало.
 */
@Module({
    providers: [
        InfoblockService,
        {
            provide: InfoblockRepository,
            useClass: InfoblockPrismaRepository,
        },
    ],
    exports: [InfoblockService],
})
export class InfoblockModule {}
