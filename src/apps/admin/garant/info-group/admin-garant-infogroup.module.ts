import { InfogroupModule, InfogroupService } from '@/modules/garant/infogroup';
import { Module } from '@nestjs/common';
import { AdminGarantInfogroupController } from './controllers/admin-garant-infogroup.controller';
import { InfogroupRepository } from '@/modules/garant/infogroup/repositories/infogroup.repository';
import { InfogroupPrismaRepository } from '@/modules/garant/infogroup/repositories/infogroup.prisma.repository';

@Module({
    imports: [InfogroupModule],
    controllers: [AdminGarantInfogroupController],
    providers: [
        InfogroupService,
        {
            provide: InfogroupRepository,
            useClass: InfogroupPrismaRepository,
        },
    ],
})
export class AdminGarantInfogroupModule {}
