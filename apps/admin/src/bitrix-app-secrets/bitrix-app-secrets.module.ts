import { Module } from '@nestjs/common';
import { PrismaModule } from '@lib/core/prisma/prisma.module';
import { BitrixAppSecretsController } from './controllers/bitrix-app-secrets.controller';
import { BitrixAppSecretsService } from './services/bitrix-app-secrets.service';

/**
 * Управление OAuth-кредами приложений Битрикс (bitrix_app_secrets)
 * из админки под SUPER_USER.
 *
 * СОЗНАТЕЛЬНО не импортирует SecretModule из @lib/bitrix-setup: тот
 * монтирует легаси-контроллер /bitrix-secret без маскирования секретов.
 */
@Module({
    imports: [PrismaModule],
    controllers: [BitrixAppSecretsController],
    providers: [BitrixAppSecretsService],
})
export class BitrixAppSecretsModule {}
