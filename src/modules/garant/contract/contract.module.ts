import { Module } from '@nestjs/common';
import { ContractController } from './contract.controller';
import { ContractService } from './contract.service';
import { ContractRepository } from './contract.repository';
import { ContractPrismaRepository } from './contract.prisma.repository';
import { PrismaService } from 'src/core/prisma';
import { PrismaModule } from '@/core/prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [ContractController],
    providers: [
        ContractService,
        {
            provide: ContractRepository,
            useClass: ContractPrismaRepository,
        },

    ],
    exports: [ContractService],
})
export class ContractModule { }
