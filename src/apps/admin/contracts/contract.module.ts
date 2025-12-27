import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core/prisma/prisma.module';
import { ContractService } from './services/contract.service';
import { ContractRepository } from './repositories/contract.repository';
import { ContractPrismaRepository } from './repositories/contract.prisma.repository';
import { ContractController } from './controllers/contract.controller';

@Module({
    imports: [PrismaModule],
    providers: [
        ContractService,
        {
            provide: ContractRepository,
            useClass: ContractPrismaRepository,
        },
    ],
    controllers: [ContractController],
    exports: [ContractService, ContractRepository],
})
export class ContractModule {}

