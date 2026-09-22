/**
 * Вторая половина ядра: провайдеры без состояния, которым нужен Битрикс
 * (PBXService либо PortalService из PBXModule). Отделены от
 * `AiAnalyticsCoreModule` намеренно — см. его шапку: срезы плана дня и
 * резюме не должны тянуть PBXModule даже транзитивно, а поддерево PBXModule
 * несёт чужие контроллеры.
 *
 * До ядра эти загрузчики дублировались попарно: KPI и финансы — в корневом
 * модуле и срезе снапшотов, планы руководителя — в корневом и срезе
 * паспорта, стор настроек — в корневом и срезе модели портала. Теперь
 * каждый объявлен один раз; импортируют модуль только срезы, которым
 * Битрикс действительно нужен (снапшоты, паспорт, модель портала) и
 * корневой модуль.
 *
 * Жёсткие счётчики стиля (`StyleCrmLoader`, телефония + лиды) живут здесь
 * же, а не в срезе стиля: их единственный потребитель — ночной шаг стиля
 * среза снапшотов, а срез стиля несёт контроллер, и импортировать его в
 * срез без контроллеров нельзя (`snapshots-module-di.spec`).
 *
 * Bitrix-инстанс в провайдерах не хранится: `PBXService.init(domain)`
 * вызывается внутри метода (CLAUDE.md про race condition).
 */
import { Module, Type } from '@nestjs/common';
import { PBXModule } from 'src/modules/pbx/pbx.module';
import { AiModule } from '@lib/call-lib';
import { PbxAicallSmartModule } from '@lib/portal-lib/pbx/pbx-aicall-smart';
import { PortalAppSettingsModule } from '@lib/portal-lib/store/app-settings';
import { FinanceLoader } from '../domain/loaders/finance.loader';
import { KpiLoader } from '../domain/loaders/kpi.loader';
import { PlansLoader } from '../domain/loaders/plans.loader';
import { SmartLinkLoader } from '../domain/loaders/smart-link.loader';
import { SalesFinanceUseCaseFactory } from '../domain/loaders/sales-finance-use-case.factory';
import { StyleCrmLoader } from '../domain/loaders/style-crm.loader';
import { AiAnalyticsSettingsStore } from '../store/ai-analytics-settings.store';
import { AiAnalyticsCoreModule } from './ai-analytics-core.module';

/** Состав PBX-половины ядра (экспортируется целиком, как и у ядра). */
export const AI_ANALYTICS_CORE_PBX_PROVIDERS: Type<unknown>[] = [
    KpiLoader,
    SalesFinanceUseCaseFactory,
    FinanceLoader,
    PlansLoader,
    AiAnalyticsSettingsStore,
    StyleCrmLoader,
    // Ссылки на карточки разборов (entityTypeId смарта портала +
    // report_item_id из ais): повестка, «Внимание», слепая оценка.
    SmartLinkLoader,
];

@Module({
    imports: [
        PBXModule,
        AiModule,
        PortalAppSettingsModule,
        PbxAicallSmartModule,
        AiAnalyticsCoreModule,
    ],
    providers: AI_ANALYTICS_CORE_PBX_PROVIDERS,
    exports: AI_ANALYTICS_CORE_PBX_PROVIDERS,
})
export class AiAnalyticsCorePbxModule {}
