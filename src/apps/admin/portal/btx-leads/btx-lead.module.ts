import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core/prisma/prisma.module';
import { BtxLeadService } from './services/btx-lead.service';
import { BtxLeadRepository } from './repositories/btx-lead.repository';
import { BtxLeadPrismaRepository } from './repositories/btx-lead.prisma.repository';
import { BtxLeadController } from './controllers/btx-lead.controller';

@Module({
    imports: [PrismaModule],
    providers: [
        BtxLeadService,
        {
            provide: BtxLeadRepository,
            useClass: BtxLeadPrismaRepository,
        },
    ],
    controllers: [BtxLeadController],
    exports: [BtxLeadService, BtxLeadRepository],
})
export class BtxLeadModule {}

