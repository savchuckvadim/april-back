import { Module } from '@nestjs/common';
import { InfogroupService } from './services/infogroup.service';
import { InfogroupRepository } from './repositories/infogroup.repository';
import { InfogroupPrismaRepository } from './repositories/infogroup.prisma.repository';

/**
 * Сервисный модуль групп инфоблоков гаранта: провайдеры и экспорт сервиса,
 * без контроллеров. Контроллер `/infogroup` (создание и правка групп) вынесен
 * в {@link InfogroupAdminModule}, чтобы публичное приложение konstructor,
 * импортирующее модуль ради InfogroupService, его не регистрировало.
 */
@Module({
    providers: [
        InfogroupService,
        {
            provide: InfogroupRepository,
            useClass: InfogroupPrismaRepository,
        },
    ],
    exports: [InfogroupService],
})
export class InfogroupModule {}
