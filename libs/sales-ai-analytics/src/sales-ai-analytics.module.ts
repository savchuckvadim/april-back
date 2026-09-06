import { Module } from '@nestjs/common';

/**
 * Модуль-обёртка библиотеки @lib/sales-ai-analytics. Сейчас библиотека —
 * чистые функции модели (Уилсон, XmR, календарь, пульс, повестка, дайджест)
 * и контракты типов; провайдеры (store снапшотов, Фаза 2) появятся здесь.
 * Контроллеры — только в SalesAiAnalyticsAdminModule (apps/admin, Фаза 3).
 */
@Module({})
export class SalesAiAnalyticsModule {}
