import { InfoblockModule, InfoblockService } from '@lib/garant/infoblock';
import { Module } from '@nestjs/common';
import { AdminGarantInfoblockController } from './controllers/admin-garant-infoblock.controller';
import { InfoblockRepository } from '@lib/garant/infoblock/infoblock.repository';
import { InfoblockPrismaRepository } from '@lib/garant/infoblock/infoblock.prisma.repository';
import { AdminGarantInfoblockPackageController } from './controllers/admin-garant-infoblock-package.controller';

@Module({
    imports: [InfoblockModule],
    controllers: [
        AdminGarantInfoblockController,
        AdminGarantInfoblockPackageController,
    ],
    providers: [
        InfoblockService,
        {
            provide: InfoblockRepository,
            useClass: InfoblockPrismaRepository,
        },
    ],
})
export class AdminGarantInfoblockModule {}
