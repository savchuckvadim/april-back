import { ComplectModule, ComplectService } from '@/modules/garant/complect';
import { Module } from '@nestjs/common';
import { AdminGarantComplectController } from './controllers/admin-garant-complect.controller';
import { ComplectRepository } from '@/modules/garant/complect/repository/complect.repository';
import { ComplectPrismaRepository } from '@/modules/garant/complect/repository/complect.prisma.repository';
import { InfoblockService } from '@/modules/garant';
import { InfoblockRepository } from '@/modules/garant/infoblock/infoblock.repository';
import { InfoblockPrismaRepository } from '@/modules/garant/infoblock/infoblock.prisma.repository';

@Module({
    imports: [ComplectModule],
    controllers: [AdminGarantComplectController],
    providers: [
        ComplectService,
        InfoblockService,
        {
            provide: ComplectRepository,
            useClass: ComplectPrismaRepository,
        },
        {
            provide: InfoblockRepository,
            useClass: InfoblockPrismaRepository,
        },
    ],
})
export class AdminGarantComplectModule {}
