import { Module } from '@nestjs/common';
import { PortalSessionModule } from '@lib/auth';
import { PortalAppSettingsModule } from '@lib/portal-lib/store/app-settings';
import { AiAnalyticsCoreModule } from '../core/ai-analytics-core.module';
import { AiAnalyticsStyleController } from './ai-analytics-style.controller';
import { StyleProfileUseCase } from './style-profile.use-case';
import { StyleSettingsLoader } from './style-settings.loader';

/**
 * Карточка стиля менеджера (документ
 * `ai/tasks/ai-analytics-manager-style.md`, потоки S2 и S4): ручка
 * профиля, чтение снапшота `ai-analytics-style` и настройка-решение
 * `ai_analytics_style_opt_out`.
 *
 * Модуль отдельный от AiAnalyticsModule сознательно: подписи о человеке —
 * самая чувствительная часть витрины, и её поверхность (контроллер,
 * настройка отказа) должна подключаться приложением осознанно, а не
 * приезжать вместе с обзором.
 *
 * Загрузчик жёстких счётчиков телефонии и CRM (`StyleCrmLoader`, оси 4, 7,
 * 8) объявлен в `AiAnalyticsCorePbxModule`: его читает ночной шаг стиля
 * среза снапшотов, а срез с контроллером в срез без контроллеров не
 * импортируется. Поэтому Битрикс этому модулю больше не нужен: кэш,
 * ростер, периметр, настройки и стор снапшотов — из ядра
 * (`AiAnalyticsCoreModule`).
 */
@Module({
    imports: [
        PortalAppSettingsModule,
        AiAnalyticsCoreModule,
        PortalSessionModule,
    ],
    controllers: [AiAnalyticsStyleController],
    providers: [StyleSettingsLoader, StyleProfileUseCase],
    exports: [StyleSettingsLoader, StyleProfileUseCase],
})
export class AiAnalyticsStyleModule {}
