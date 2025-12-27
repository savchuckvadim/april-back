import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core/prisma/prisma.module';
import { PortalContractService } from './services/portal-contract.service';
import { PortalContractRepository } from './repositories/portal-contract.repository';
import { PortalContractPrismaRepository } from './repositories/portal-contract.prisma.repository';
import { PortalContractController } from './controllers/portal-contract.controller';

@Module({
    imports: [PrismaModule],
    providers: [
        PortalContractService,
        {
            provide: PortalContractRepository,
            useClass: PortalContractPrismaRepository,
        },
    ],
    controllers: [PortalContractController],
    exports: [PortalContractService, PortalContractRepository],
})
export class PortalContractModule {}

