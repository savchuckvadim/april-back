import { Module } from '@nestjs/common';
import { BitrixSecretService } from './services/bitrix-secret.service';
import { BitrixSecretRepository } from './repositories/bitrix-secret.repository';
import { BitrixSecretController } from './controllers/bitrix-secret.controller';
import { PrismaService } from 'src/core/prisma';
import { BitrixSecretPrismaRepository } from './repositories/bitrix-secret.prisma.repository';

@Module({
    imports: [],
    controllers: [
        BitrixSecretController,
    ],
    providers: [
        BitrixSecretService,
        {
            provide: BitrixSecretRepository,
            useClass: BitrixSecretPrismaRepository,
        },
        PrismaService,
    ],
    exports: [
        BitrixSecretService,
        BitrixSecretRepository,
    ],
})
export class SecretModule { }
