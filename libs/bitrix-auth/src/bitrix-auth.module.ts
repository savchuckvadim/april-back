import { Global, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { BITRIX_TOKEN_PROVIDER } from '@lib/bitrix';
import { PrismaService } from '@/core/prisma';
import { BitrixAuthRepository } from './persistence/bitrix-auth.repository';
import { BitrixAuthPrismaRepository } from './persistence/bitrix-auth.prisma.repository';
import { BitrixTokenRefreshService } from './refresh/bitrix-token-refresh.service';

/**
 * Модуль домена аутентификации Bitrix (хранение/обновление учёток портала).
 * Реализует порт BITRIX_TOKEN_PROVIDER из libs/bitrix и предоставляет его
 * наружу. Помечен @Global, чтобы порт был виден инжектору BitrixServiceFactory
 * (объявлена в BitrixModule) без обратной зависимости BitrixModule → этот модуль.
 */
@Global()
@Module({
    imports: [HttpModule],
    providers: [
        PrismaService,
        {
            provide: BitrixAuthRepository,
            useClass: BitrixAuthPrismaRepository,
        },
        BitrixTokenRefreshService,
        {
            provide: BITRIX_TOKEN_PROVIDER,
            useExisting: BitrixTokenRefreshService,
        },
    ],
    exports: [BITRIX_TOKEN_PROVIDER, BitrixTokenRefreshService],
})
export class BitrixAuthModule {}
