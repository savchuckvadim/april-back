import { InfogroupModule, InfogroupService } from '@lib/garant/infogroup';
import { Module } from '@nestjs/common';
import { AdminGarantInfogroupController } from './controllers/admin-garant-infogroup.controller';
import { InfogroupRepository } from '@lib/garant/infogroup/repositories/infogroup.repository';
import { InfogroupPrismaRepository } from '@lib/garant/infogroup/repositories/infogroup.prisma.repository';

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
