import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from '@lib/logger';
import { MetricsModule } from '@lib/metrics';
import { GlobalExceptionFilter, HealthModule } from '@/core';
import { BitrixBotModule } from './bitrix/bitrix-bot.module';
import { TelegramBotModule } from './telegram/telegram-bot.module';

/**
 * Корневой модуль приложения bot.
 *
 * Назначение: каналы общения с пользователями (Bitrix-бот и Telegram-бот).
 * Боты знают сценарии и кнопки, опрашивают пользователя, собирают предданные
 * и отправляют их в профильные приложения (ai, event, kpi-report и т.д.).
 * Само ядро бизнес-логики живёт в других apps — здесь только шаблоны каналов.
 *
 * Архитектура: app зависит только от общих библиотек (libs/*) и собственных
 * feature-модулей каналов. Пока это рабочие шаблоны без полной бизнес-логики.
 */
@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: ['apps/bot/.env', '.env'],
            ignoreEnvFile: false,
        }),
        LoggerModule.forRoot({ appName: 'bot' }),
        MetricsModule.forRoot({ appName: 'bot' }),
        HealthModule,
        BitrixBotModule,
        TelegramBotModule,
    ],
    providers: [GlobalExceptionFilter],
})
export class AppModule {}
