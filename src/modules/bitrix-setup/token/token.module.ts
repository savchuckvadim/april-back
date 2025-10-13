import { Module } from '@nestjs/common';
import { BitrixTokenService } from './services/bitrix-token.service';
import { BitrixTokenRepository } from './repositories/bitrix-token.repository';
import { BitrixTokenController } from './controllers/bitrix-token.controller';
import { PrismaService } from 'src/core/prisma';
import { BitrixTokenPrismaRepository } from './repositories/bitrix-token.prisma.repository';

@Module({
    imports: [],
    controllers: [
        BitrixTokenController,
    ],
    providers: [
        BitrixTokenService,
        {
            provide: BitrixTokenRepository,
            useClass: BitrixTokenPrismaRepository,
        },
        PrismaService,
    ],
    exports: [
        BitrixTokenService,
        BitrixTokenRepository,
    ],
})
export class TokenModule { }
