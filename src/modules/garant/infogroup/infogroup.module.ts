import { Module } from '@nestjs/common';
import { InfogroupController } from './controllers/infogroup.controller';
import { InfogroupService } from './services/infogroup.service';
import { InfogroupRepository } from './repositories/infogroup.repository';
import { InfogroupPrismaRepository } from './repositories/infogroup.prisma.repository';

@Module({
    controllers: [InfogroupController],
    providers: [
        InfogroupService,
        {
            provide: InfogroupRepository,
            useClass: InfogroupPrismaRepository,
        },
    ],
    exports: [InfogroupService],
})
export class InfogroupModule {}
