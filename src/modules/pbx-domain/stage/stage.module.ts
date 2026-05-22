import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core/prisma/prisma.module';
import { BtxStageRepository } from './repositories/btx-stage.repository';
import { BtxStagePrismaRepository } from './repositories/btx-stage.prisma.repository';

@Module({
    imports: [PrismaModule],
    providers: [
        {
            provide: BtxStageRepository,
            useClass: BtxStagePrismaRepository,
        },
    ],
    exports: [BtxStageRepository],
})
export class PortalStageModule {}
