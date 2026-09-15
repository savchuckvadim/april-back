import { Module } from '@nestjs/common';
import { PBXModule } from 'src/modules/pbx/pbx.module';
import { AiModule } from '@lib/call-lib';
import { BxDepartmentModule } from '@lib/bx-department';
import { PortalAppSettingsModule } from '@lib/portal-lib/store/app-settings';
import { AiAnalyticsCacheService } from '../cache/ai-analytics-cache.service';
import { RequesterAccessService } from '../domain/access/requester-access.service';
import { ManagersLoader } from '../domain/loaders/managers.loader';
import { SettingsLoader } from '../domain/loaders/settings.loader';
import { StyleCrmLoader } from '../domain/loaders/style-crm.loader';
import { AiAnalyticsSnapshotStore } from '../store/ai-analytics-snapshot.store';
import { AiAnalyticsStyleController } from './ai-analytics-style.controller';
import { StyleProfileUseCase } from './style-profile.use-case';
import { StyleSettingsLoader } from './style-settings.loader';

/**
 * Карточка стиля менеджера (документ
 * `ai/tasks/ai-analytics-manager-style.md`, потоки S2 и S4): ручка
 * профиля, чтение снапшота `ai-analytics-style`, настройка-решение
 * `ai_analytics_style_opt_out` и загрузчик жёстких счётчиков телефонии и
 * CRM для осей 4, 7, 8.
 *
 * Модуль отдельный от AiAnalyticsModule сознательно: подписи о человеке —
 * самая чувствительная часть витрины, и её поверхность (контроллер,
 * настройка отказа, загрузчик счётчиков) должна подключаться приложением
 * осознанно, а не приезжать вместе с обзором.
 *
 * `StyleCrmLoader` экспортируется: ночной шаг стиля берёт счётчики из
 * него, а не считает телефонию второй раз.
 */
@Module({
    imports: [PBXModule, AiModule, BxDepartmentModule, PortalAppSettingsModule],
    controllers: [AiAnalyticsStyleController],
    providers: [
        AiAnalyticsCacheService,
        RequesterAccessService,
        SettingsLoader,
        ManagersLoader,
        StyleCrmLoader,
        StyleSettingsLoader,
        AiAnalyticsSnapshotStore,
        StyleProfileUseCase,
    ],
    exports: [StyleCrmLoader, StyleSettingsLoader, StyleProfileUseCase],
})
export class AiAnalyticsStyleModule {}
