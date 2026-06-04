import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@/core/prisma/prisma.module';
import { GlobalExceptionFilter } from '@/core/filters/global-exception.filter';
import { HealthModule } from '@/core';
import { PBXInstallModule } from './modules/pbx-install.module';

/**
 * Корневой модуль приложения установки/синхронизации конфигурации Bitrix-портала.
 *
 * Архитектура: app зависит только от feature-модуля PBXInstallModule и общих
 * библиотек (libs/*). Доступ к PortalDB — через @lib/pbx-domain, к Bitrix — через
 * @lib/bitrix (инстанс по domain выдаёт PBXService из @lib/pbx).
 */
@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: ['apps/pbx-install/.env', '.env'],
            ignoreEnvFile: false,
            load: [
                () => ({
                    REDIS_URL: process.env.REDIS_URL,
                    REDIS_HOST: process.env.REDIS_HOST,
                    REDIS_PORT: process.env.REDIS_PORT,
                    REDIS_USER: process.env.REDIS_USER,
                    REDIS_PASSWORD: process.env.REDIS_PASSWORD,
                }),
            ],
        }),
        PrismaModule,
        HealthModule,
        PBXInstallModule,
    ],
    providers: [GlobalExceptionFilter],
})
export class AppModule {}
