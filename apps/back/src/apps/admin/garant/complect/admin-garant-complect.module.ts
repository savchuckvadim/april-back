import { ComplectModule, ComplectService } from '@lib/garant/complect';
import { Module } from '@nestjs/common';
import { AdminGarantComplectController } from './controllers/admin-garant-complect.controller';
import { ComplectRepository } from '@lib/garant/complect/repository/complect.repository';
import { ComplectPrismaRepository } from '@lib/garant/complect/repository/complect.prisma.repository';
import { InfoblockService } from '@lib/garant';
import { InfoblockRepository } from '@lib/garant/infoblock/infoblock.repository';
import { InfoblockPrismaRepository } from '@lib/garant/infoblock/infoblock.prisma.repository';

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
