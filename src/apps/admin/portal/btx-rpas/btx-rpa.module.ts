import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core/prisma/prisma.module';
import { BtxRpaService } from './services/btx-rpa.service';
import { BtxRpaRepository } from './repositories/btx-rpa.repository';
import { BtxRpaPrismaRepository } from './repositories/btx-rpa.prisma.repository';
import { BtxRpaController } from './controllers/btx-rpa.controller';

@Module({
    imports: [PrismaModule],
    providers: [
        BtxRpaService,
        {
            provide: BtxRpaRepository,
            useClass: BtxRpaPrismaRepository,
        },
    ],
    controllers: [BtxRpaController],
    exports: [BtxRpaService, BtxRpaRepository],
})
export class BtxRpaModule { }

