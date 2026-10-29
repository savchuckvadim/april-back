import { Module } from '@nestjs/common';
import { VendorSettingsModule } from '@lib/portal-lib/store/vendor-settings/vendor-settings.module';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { CronJobsReportModule } from '@lib/core/schedule';
import { LoggerModule } from '@lib/logger';
import { MetricsModule } from '@lib/metrics';
import { GlobalExceptionFilter, HealthModule } from '@/core';
import { BitrixBotModule } from './bitrix/bitrix-bot.module';
import { SupportMonitorBotModule } from './support-monitor/support-monitor-bot.module';
import { SupportApiModule } from './support-api/support-api.module';
import { SupportTelegramAppModule } from './support-telegram/support-telegram-app.module';

/**
 * Корневой модуль приложения bot.
 *
 * Назначение: каналы общения с пользователями. Боты знают сценарии и кнопки,
 * опрашивают пользователя и зовут сервисы библиотек; само ядро бизнес-логики
 * живёт в libs/*. Рабочие модули — поддержка клиентов: мониторинг линии,
 * Support API для ИИ из терминала и Telegram-бот с ИИ-помощником.
 * Bitrix-бот пока шаблон.
 *
 * Архитектура: app зависит только от общих библиотек (libs/*) и собственных
 * feature-модулей каналов.
 */
@Module({
    imports: [
        // Настройки вендора из админки (прокси за рубеж, ключи AI) для библиотек этого приложения.
        VendorSettingsModule,
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
        // Оповещения о диалогах линии поддержки (план 26.10.2026)
        SupportMonitorBotModule,
        // Support API для техспециалиста и ИИ (MCP april-support)
        SupportApiModule,
        // Telegram-бот поддержки: команды ИИ-помощнику и кнопки (28.10.2026)
        SupportTelegramAppModule,
    ],
    providers: [GlobalExceptionFilter],
})
export class AppModule {}
