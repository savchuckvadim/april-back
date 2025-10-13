import { Module } from '@nestjs/common';

import { BitrixAppController } from './controllers/bitrix-app.controller';
import { PrismaService } from 'src/core/prisma';
import { BitrixAppService } from './services/bitrix-app.service';
import { BitrixAppRepository } from './repositories/bitrix-app.repository';
import { BitrixAppPrismaRepository } from './repositories/bitrix-app.prisma.repository';
import { PortalModule } from 'src/modules/portal-konstructor/portal/portal.module';
import { TokenModule } from '../token/token.module';

@Module({
    imports: [PortalModule, TokenModule],
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
export class AppModule { }
