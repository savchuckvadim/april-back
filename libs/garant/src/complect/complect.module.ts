import { Module } from '@nestjs/common';
import { ComplectService } from './services/complect.service';
import { ComplectRepository } from './repository/complect.repository';
import { ComplectPrismaRepository } from './repository/complect.prisma.repository';
import { InfoblockModule } from '../infoblock/';

/**
 * Сервисный модуль комплектов гаранта: провайдеры и экспорт сервиса, без
 * контроллеров. Контроллер `/complect` (создание и правка комплектов) вынесен
 * в {@link ComplectAdminModule}, чтобы публичное приложение konstructor,
 * импортирующее модуль ради ComplectService, его не регистрировало.
 */
@Module({
    imports: [InfoblockModule],
    providers: [
        ComplectService,
        {
            provide: ComplectRepository,
            useClass: ComplectPrismaRepository,
        },
    ],
    exports: [ComplectService],
})
export class ComplectModule {}
