import { Module } from '@nestjs/common';
import { PortalContractService } from './portal-contract.service';
import { PortalContractFormService } from './portal-contract-form.service';
import { PortalContractRepository } from './portal-contract.repository';
import { PortalContractPrismaRepository } from './portal-contract.prisma.repository';

@Module({
    providers: [
        PortalContractService,
        PortalContractFormService,
        {
            provide: PortalContractRepository,
            useClass: PortalContractPrismaRepository,
        },
    ],
    exports: [
        PortalContractService,
        PortalContractFormService,
        PortalContractRepository,
    ],
})
export class PortalContractModule {}
