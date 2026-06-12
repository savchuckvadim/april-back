import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@/core/prisma/prisma.module';
import { GlobalExceptionFilter, HealthModule } from '@/core';
import { RqModule } from '../rq.module';

/**
 * Корневой модуль приложения «Реквизиты» (rq).
 *
 * Архитектура: app зависит только от feature-модуля RqModule и общих
 * библиотек (libs/*). Доступ к Bitrix — через инстанс по domain (PBXService
 * из @lib/pbx), к PortalDB — через @lib/portal-lib. Своего this.bitrix в
 * Injectable-сервисах нет (см. CLAUDE.md / BITRIX_DOMAIN_MODULE_GUIDE.md).
 */
@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: ['apps/rq/.env', '.env'],
            ignoreEnvFile: false,
        }),
        PrismaModule,
        HealthModule,
        RqModule,
    ],
    providers: [GlobalExceptionFilter],
})
export class AppModule {}
