import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from '@lib/logger';
import { MetricsModule } from '@lib/metrics';
import { GlobalExceptionFilter, HealthModule } from '@/core';
import { AuthModule } from '@lib/auth';
import { AdminController } from './admin.controller';
import { AdminAddModule } from './admin-app.module';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: ['apps/admin/.env', '.env'],
        }),
        LoggerModule.forRoot({ appName: 'admin' }),
        MetricsModule.forRoot({ appName: 'admin' }),
        HealthModule,
        // Авторизация (SuperUser, JWT) — общий с pbx-install секрет даёт SSO.
        // По умолчанию выключена (AUTH_ENABLED=false). Подробнее — @lib/auth.
        AuthModule.forRoot(),
        AdminAddModule,
    ],
    controllers: [AdminController],
    providers: [GlobalExceptionFilter],
})
export class AdminModule {}
