import { Module } from '@nestjs/common';
import { ContractService } from './contract.service';
import { ContractRepository } from './contract.repository';
import { ContractPrismaRepository } from './contract.prisma.repository';

@Module({
    providers: [
        ContractService,
        {
            provide: ContractRepository,
            useClass: ContractPrismaRepository,
        },
    ],
    exports: [ContractService, ContractRepository],
})
export class ContractModule {}
