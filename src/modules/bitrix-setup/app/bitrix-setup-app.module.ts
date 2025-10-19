import { Module } from '@nestjs/common';

import { BitrixAppController } from './controllers/bitrix-app.controller';
import { PrismaService } from 'src/core/prisma';
import { BitrixAppService } from './services/bitrix-app.service';
import { BitrixAppRepository } from './repositories/bitrix-app.repository';
import { BitrixAppPrismaRepository } from './repositories/bitrix-app.prisma.repository';
import { PortalStoreModule } from '@/modules/portal-konstructor/portal/portal-store.module';
import { TokenModule } from '../token/token.module';

@Module({
    imports: [PortalStoreModule, TokenModule],
    controllers: [
        BitrixAppController,
    ],
    providers: [
        BitrixAppService,
        {
            provide: BitrixAppRepository,
            useClass: BitrixAppPrismaRepository,
        },
        PrismaService,
    ],
    exports: [
        BitrixAppService,
        BitrixAppRepository,
    ],
})
export class BitrixSetupAppModule { }
