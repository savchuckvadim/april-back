import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { CronJobsReportModule } from '@lib/core/schedule';
import { LoggerModule } from '@lib/logger';
import { MetricsModule } from '@lib/metrics';
import { GlobalExceptionFilter, HealthModule } from '@/core';
import { BitrixBotModule } from './bitrix/bitrix-bot.module';
import { TelegramBotModule } from './telegram/telegram-bot.module';
import { SupportMonitorBotModule } from './support-monitor/support-monitor-bot.module';
import { SupportApiModule } from './support-api/support-api.module';

/**
 * Корневой модуль приложения bot.
 *
 * Назначение: каналы общения с пользователями (Bitrix-бот и Telegram-бот).
 * Боты знают сценарии и кнопки, опрашивают пользователя, собирают предданные
 * и отправляют их в профильные приложения (ai, event, kpi-report и т.д.).
 * Само ядро бизнес-логики живёт в других apps — здесь только шаблоны каналов.
 *
 * Архитектура: app зависит только от общих библиотек (libs/*) и собственных
 * feature-модулей каналов. Каналы Bitrix и Telegram пока шаблоны; рабочий
 * модуль — мониторинг линии поддержки (крон, правила в @lib/support).
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
        // Кроны бота (мониторинг линии поддержки); на зеркале их
        // останавливает bootstrapApp (APP_ROLE=standby).
        ScheduleModule.forRoot(),
        // При старте — список кронов с ближайшими запусками в Telegram
        CronJobsReportModule,
        HealthModule,
        BitrixBotModule,
        TelegramBotModule,
        // Оповещения о диалогах линии поддержки (план 26.10.2026)
        SupportMonitorBotModule,
        // Support API для техспециалиста и ИИ (MCP april-support)
        SupportApiModule,
    ],
    providers: [GlobalExceptionFilter],
})
export class AppModule {}
