import { Module } from '@nestjs/common';
import { ContractService } from './contract.service';
import { ContractRepository } from './contract.repository';
import { ContractPrismaRepository } from './contract.prisma.repository';
import { PrismaModule } from '@/core/prisma/prisma.module';

/**
 * Сервисный модуль договоров гаранта: провайдеры и экспорт сервиса, без
 * контроллеров. Контроллер `/contracts` (создание и правка договоров) вынесен
 * в {@link ContractAdminModule}, чтобы публичное приложение konstructor,
 * импортирующее модуль ради ContractService, его не регистрировало.
 */
@Module({
    imports: [PrismaModule],
    providers: [
        ContractService,
        {
            provide: ContractRepository,
            useClass: ContractPrismaRepository,
        },
    ],
    exports: [ContractService],
})
export class ContractModule {}
