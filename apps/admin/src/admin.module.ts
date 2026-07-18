import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from '@lib/logger';
import { MetricsModule } from '@lib/metrics';
import { GlobalExceptionFilter, HealthModule } from '@/core';
import { AuthModule } from '@lib/auth';
import { AdminController } from './admin.controller';
import { AdminAddModule } from './admin-app.module';
import { OfferWordModule } from '@app/konstructor/offer-word/offer-word.module';
import { OfferModule } from '@app/konstructor/offer/offer.module';
import { GarantModule } from '@lib/garant';
// import { MailModule } from '@lib/mail';

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
        OfferWordModule,
        OfferModule,
        GarantModule,
        // MailModule,
    ],
    controllers: [AdminController],
    providers: [GlobalExceptionFilter],
    exports: [OfferWordModule, OfferModule, GarantModule],
})
export class AdminModule {}
