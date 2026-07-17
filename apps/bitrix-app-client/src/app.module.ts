import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from '@lib/logger';
import { MetricsModule } from '@lib/metrics';
import { PrismaModule } from '@/core/prisma/prisma.module';
import { GlobalExceptionFilter, HealthModule } from '@/core';
import { BitrixAppClientModule } from './app/bitrix-app-client.module';

/**
 * Корневой модуль приложения bitrix-app-client.
 *
 * Legacy-мир установки Bitrix24-приложения: install/reinstall токенов,
 * секреты и настройки приложений, аккаунты (Client → User → Portal →
 * bitrix_apps → bitrix_tokens), JWT-авторизация с подтверждением почты
 * (@lib/mail). Новый мир marketplace живёт отдельно в apps/pbx.
 */
@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: ['apps/bitrix-app-client/.env', '.env'],
        }),
        LoggerModule.forRoot({ appName: 'bitrix-app-client' }),
        MetricsModule.forRoot({ appName: 'bitrix-app-client' }),
        PrismaModule,
        HealthModule,
        BitrixAppClientModule,
    ],
    providers: [GlobalExceptionFilter],
})
export class AppModule {}
